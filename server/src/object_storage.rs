//! 对象存储：阿里云 OSS / 雨云 ROS 等 S3 兼容服务。
//!
//! 配置存在 `settings` 表；媒体行只记 `storage='s3'` 与 `object_key`，
//! 读取时由后端代理 `/api/v1/media/{id}`，不要求桶公开、也不用处理跨域。
//! 客户端用 Apache `object_store` 的 S3 实现，两家服务都走同一套代码。

use std::sync::Arc;

use object_store::ObjectStore;
use object_store::aws::AmazonS3Builder;
use object_store::path::Path as ObjectPath;
use serde_json::{Map, Value};
use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::config::Config;
use crate::settings;

#[derive(Clone)]
pub struct StorageConfig {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub prefix: String,
    pub force_path_style: bool,
}

impl StorageConfig {
    /// 配置字段不全返回 Err；是否启用由调用方看 `storageDriver`。
    /// 这样切回本地存储后，已经上传到桶里的旧图仍然能读、能删。
    pub fn from_values(map: &Map<String, Value>) -> Result<Option<Self>, String> {
        let endpoint = settings::text(map, "storageEndpoint").trim().to_string();
        let region = settings::text(map, "storageRegion").trim().to_string();
        let bucket = settings::text(map, "storageBucket").trim().to_string();
        let access_key = settings::text(map, "storageAccessKey").trim().to_string();
        let secret_key = settings::text(map, "storageSecretKey").trim().to_string();
        let prefix = settings::text(map, "storagePathPrefix")
            .trim()
            .trim_matches('/')
            .to_string();
        let force_path_style = settings::flag(map, "storageForcePathStyle", true);

        // 默认的本地存储就是所有字段为空，直接当没配置
        if endpoint.is_empty()
            && region.is_empty()
            && bucket.is_empty()
            && access_key.is_empty()
            && secret_key.is_empty()
        {
            if settings::text(map, "storageDriver") == "s3" {
                return Err(
                    "对象存储配置不完整：请填写 Endpoint、Region、Bucket、AccessKey、SecretKey"
                        .into(),
                );
            }
            return Ok(None);
        }

        let missing = [
            ("Endpoint", &endpoint),
            ("Region", &region),
            ("Bucket", &bucket),
            ("AccessKey", &access_key),
            ("SecretKey", &secret_key),
        ]
        .into_iter()
        .filter(|(_, v)| v.is_empty())
        .map(|(name, _)| name)
        .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(format!("对象存储配置不完整：缺少 {}", missing.join("、")));
        }

        Ok(Some(Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
            region,
            bucket,
            access_key,
            secret_key,
            prefix: if prefix.is_empty() {
                "uploads".into()
            } else {
                prefix
            },
            force_path_style,
        }))
    }

    fn fingerprint(&self) -> String {
        format!(
            "{}|{}|{}|{}|{}|{}",
            self.endpoint,
            self.region,
            self.bucket,
            self.access_key,
            self.secret_key,
            self.force_path_style
        )
    }

    fn build(&self) -> Result<Arc<dyn ObjectStore>, String> {
        let s3 = AmazonS3Builder::new()
            .with_bucket_name(&self.bucket)
            .with_region(&self.region)
            .with_access_key_id(&self.access_key)
            .with_secret_access_key(&self.secret_key)
            .with_endpoint(&self.endpoint)
            .with_allow_http(self.endpoint.starts_with("http://"))
            .with_virtual_hosted_style_request(!self.force_path_style)
            .build()
            .map_err(|e| format!("对象存储客户端初始化失败：{e}"))?;
        Ok(Arc::new(s3))
    }

    pub fn object_key(&self, kind: &str, user_id: &str, id: &str, mime: &str) -> String {
        let ext = match mime {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => "bin",
        };
        format!("{}/{}/{}/{}.{}", self.prefix, kind, user_id, id, ext)
    }
}

type CachedStore = Option<(String, Arc<dyn ObjectStore>)>;

/// (客户端, 配置, 是否启用)
pub type ResolvedStore = Option<(Arc<dyn ObjectStore>, StorageConfig, bool)>;

/// 进程内缓存：后台改配置后指纹变化，自动重建客户端。
#[derive(Default, Clone)]
pub struct Cache {
    inner: Arc<RwLock<CachedStore>>,
}

impl Cache {
    /// 返回 (客户端, 配置, 是否启用)。即使 driver=db，只要字段齐全也返回客户端，
    /// 供读取/删除历史对象；上传时再看第三个值。
    pub async fn resolve(&self, pool: &PgPool, app: &Config) -> Result<ResolvedStore, String> {
        let merged = settings::load(pool, app).await;
        let enabled = settings::text(&merged, "storageDriver") == "s3";
        let Some(conf) = StorageConfig::from_values(&merged)? else {
            return Ok(None);
        };

        let fp = conf.fingerprint();
        {
            let guard = self.inner.read().await;
            if let Some((cached_fp, store)) = guard.as_ref() {
                if cached_fp == &fp {
                    return Ok(Some((store.clone(), conf, enabled)));
                }
            }
        }

        let store = conf.build()?;
        *self.inner.write().await = Some((fp, store.clone()));
        Ok(Some((store, conf, enabled)))
    }
}

fn path(key: &str) -> Result<ObjectPath, String> {
    ObjectPath::parse(key).map_err(|e| format!("对象路径不合法：{e}"))
}

pub async fn put(
    store: &Arc<dyn ObjectStore>,
    key: &str,
    body: bytes::Bytes,
) -> Result<(), String> {
    store
        .put(&path(key)?, body.into())
        .await
        .map(|_| ())
        .map_err(|e| format!("上传对象失败：{e}"))
}

pub async fn get(store: &Arc<dyn ObjectStore>, key: &str) -> Result<bytes::Bytes, String> {
    let result = store
        .get(&path(key)?)
        .await
        .map_err(|e| format!("读取对象失败：{e}"))?;
    result
        .bytes()
        .await
        .map_err(|e| format!("读取对象内容失败：{e}"))
}

pub async fn delete(store: &Arc<dyn ObjectStore>, key: &str) -> Result<(), String> {
    store
        .delete(&path(key)?)
        .await
        .map_err(|e| format!("删除对象失败：{e}"))
}

/// 后台「测试连接」：写一个探针再删掉，验证凭证与桶权限。
pub async fn test(conf: &StorageConfig) -> Result<(), String> {
    let store = conf.build()?;
    let key = format!("{}/.healthcheck", conf.prefix);
    put(&store, &key, bytes::Bytes::from_static(b"ok")).await?;
    let _ = delete(&store, &key).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn map(v: Value) -> Map<String, Value> {
        v.as_object().cloned().unwrap_or_default()
    }

    #[test]
    fn parses_aliyun_and_rainyun() {
        let aliyun = StorageConfig::from_values(&map(json!({
            "storageDriver": "s3",
            "storageEndpoint": "https://s3.oss-cn-hangzhou.aliyuncs.com/",
            "storageRegion": "cn-hangzhou",
            "storageBucket": "my-bucket",
            "storageAccessKey": "ak",
            "storageSecretKey": "sk",
            "storagePathPrefix": "/uploads/",
            "storageForcePathStyle": false
        })))
        .unwrap()
        .unwrap();
        assert!(!aliyun.endpoint.ends_with('/'));
        assert_eq!(aliyun.prefix, "uploads");
        assert!(!aliyun.force_path_style);
        assert_eq!(
            aliyun.object_key("avatar", "u1", "o1", "image/png"),
            "uploads/avatar/u1/o1.png"
        );

        let rainyun = StorageConfig::from_values(&map(json!({
            "storageDriver": "s3",
            "storageEndpoint": "https://cn-sy1.rains3.com",
            "storageRegion": "rainyun",
            "storageBucket": "bucket",
            "storageAccessKey": "ak",
            "storageSecretKey": "sk",
            "storagePathPrefix": "",
            "storageForcePathStyle": true
        })))
        .unwrap()
        .unwrap();
        assert_eq!(rainyun.prefix, "uploads");
        assert!(rainyun.force_path_style);
    }

    #[test]
    fn local_default_is_not_an_error() {
        assert!(
            StorageConfig::from_values(&map(json!({ "storageDriver": "db" })))
                .unwrap()
                .is_none()
        );
        assert!(
            StorageConfig::from_values(&map(json!({
                "storageDriver": "s3",
                "storageEndpoint": "",
                "storageRegion": "",
                "storageBucket": "",
                "storageAccessKey": "",
                "storageSecretKey": ""
            })))
            .is_err()
        );
    }

    #[test]
    fn missing_fields_are_reported() {
        let result = StorageConfig::from_values(&map(json!({
            "storageDriver": "s3",
            "storageEndpoint": "https://cn-sy1.rains3.com"
        })));
        match result {
            Err(e) => {
                assert!(e.contains("Bucket"));
                assert!(e.contains("AccessKey"));
            }
            _ => panic!("缺少字段时应返回错误"),
        }
    }
}
