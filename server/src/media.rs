//! 用户上传的图片（头像 / 背景 / 帖子配图）。
//!
//! 存 PostgreSQL `user_media.bytes`，不落文件系统：备份脚本只跑 pg_dump，
//! 文件目录很容易漏备；单实例、2MB 以内，bytea 足够。
//! 对外统一走 `/api/v1/media/{id}`，与页面同源，Canvas 分享图不会跨域污染。

use sqlx::PgPool;

use crate::object_storage;
use crate::state::AppState;

/// 单张图片上限 2MB
pub const MAX_BYTES: usize = 2 * 1024 * 1024;

/// 只认真正的图片魔数，不信任请求头
pub fn detect(body: &[u8]) -> Option<&'static str> {
    if body.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if body.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if body.len() > 12 && &body[0..4] == b"RIFF" && &body[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if body.starts_with(b"GIF87a") || body.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    None
}

pub fn kind_ok(kind: &str) -> bool {
    matches!(kind, "avatar" | "background" | "post")
}

pub struct StoredMedia {
    pub mime: String,
    pub storage: String,
    pub object_key: String,
    pub bytes: Option<Vec<u8>>,
}

/// 存进 PostgreSQL（默认路径）
pub async fn save_local(
    pool: &PgPool,
    user_id: &str,
    kind: &str,
    mime: &str,
    body: &[u8],
) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('m');
    sqlx::query(
        "INSERT INTO user_media (id, user_id, kind, mime, bytes, size, storage, object_key)
         VALUES ($1,$2,$3,$4,$5,$6,'db','')",
    )
    .bind(&id)
    .bind(user_id)
    .bind(kind)
    .bind(mime)
    .bind(body)
    .bind(body.len() as i32)
    .execute(pool)
    .await?;
    Ok(id)
}

/// 只记对象键，字节已经在桶里
pub async fn save_object(
    pool: &PgPool,
    user_id: &str,
    kind: &str,
    mime: &str,
    object_key: &str,
    size: usize,
) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('m');
    sqlx::query(
        "INSERT INTO user_media (id, user_id, kind, mime, bytes, size, storage, object_key)
         VALUES ($1,$2,$3,$4,NULL,$5,'s3',$6)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(kind)
    .bind(mime)
    .bind(size as i32)
    .bind(object_key)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn load(pool: &PgPool, id: &str) -> Result<Option<StoredMedia>, sqlx::Error> {
    let row: Option<(String, String, String, Option<Vec<u8>>)> = sqlx::query_as(
        "SELECT mime, storage, object_key, bytes FROM user_media WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(mime, storage, object_key, bytes)| StoredMedia {
        mime,
        storage,
        object_key,
        bytes,
    }))
}

pub async fn delete_owned(st: &AppState, id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT storage, object_key FROM user_media WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .fetch_optional(&st.pool)
            .await?;
    let Some((storage, object_key)) = row else {
        return Ok(false);
    };

    if storage == "s3" && !object_key.is_empty() {
        if let Ok(Some((store, _, _))) = st.object_store.resolve(&st.pool, st.cfg.as_ref()).await {
            let _ = object_storage::delete(&store, &object_key).await;
        }
    }

    let done = sqlx::query("DELETE FROM user_media WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&st.pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 只处理本站媒体地址 `/api/v1/media/{id}`；外部 URL 不碰
pub async fn delete_url(st: &AppState, user_id: &str, url: &str) -> Result<bool, sqlx::Error> {
    let Some(id) = url.strip_prefix("/api/v1/media/") else {
        return Ok(false);
    };
    if id.is_empty() || id.contains('/') {
        return Ok(false);
    }
    delete_owned(st, id, user_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_images() {
        assert_eq!(detect(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]), Some("image/png"));
        assert_eq!(detect(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(detect(b"not-an-image"), None);
        assert_eq!(detect(b"<svg></svg>"), None);
    }

    #[test]
    fn only_site_media_urls_are_deleted() {
        assert_eq!(id_of("/api/v1/media/m123"), Some("m123"));
        assert_eq!(id_of("https://evil.test/a.png"), None);
        assert_eq!(id_of("/api/v1/media/../x"), None);
    }

    fn id_of(url: &str) -> Option<&str> {
        let id = url.strip_prefix("/api/v1/media/")?;
        if id.is_empty() || id.contains('/') {
            return None;
        }
        Some(id)
    }
}
