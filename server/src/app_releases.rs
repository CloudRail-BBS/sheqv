//! 客户端版本发布：Windows / macOS / Android 的安装包与更新信息。
//!
//! 只存发布元数据，安装包由管理员上传到对象存储/静态目录后填下载地址；
//! 客户端通过公开接口取最新版本，Web 后台负责发布与下线。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

pub const PLATFORMS: [&str; 5] = [
    "windows-x64",
    "windows-arm64",
    "macos-arm64",
    "macos-x64",
    "android",
];
pub const CHANNELS: [&str; 2] = ["stable", "beta"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRelease {
    pub id: String,
    pub platform: String,
    pub channel: String,
    pub version: String,
    pub build: i32,
    pub download_url: String,
    pub notes: String,
    pub force_update: bool,
    pub min_version: String,
    pub published: bool,
    pub file_size: i64,
    pub sha256: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    platform: String,
    channel: String,
    version: String,
    build: i32,
    download_url: String,
    notes: String,
    force_update: bool,
    min_version: String,
    published: bool,
    file_size: i64,
    sha256: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl Row {
    fn view(self) -> AppRelease {
        AppRelease {
            id: self.id,
            platform: self.platform,
            channel: self.channel,
            version: self.version,
            build: self.build,
            download_url: self.download_url,
            notes: self.notes,
            force_update: self.force_update,
            min_version: self.min_version,
            published: self.published,
            file_size: self.file_size,
            sha256: self.sha256,
            created_at: self.created_at.format("%Y-%m-%d").to_string(),
            updated_at: self.updated_at.format("%Y-%m-%d").to_string(),
        }
    }
}

const COLS: &str = "id, platform, channel, version, build, download_url, notes, force_update,
    min_version, published, file_size, sha256, created_at, updated_at";

pub async fn list(pool: &PgPool, only_published: bool) -> Result<Vec<AppRelease>, sqlx::Error> {
    let sql = if only_published {
        format!("SELECT {COLS} FROM app_releases WHERE published ORDER BY platform, channel, build DESC")
    } else {
        format!("SELECT {COLS} FROM app_releases ORDER BY platform, channel, build DESC")
    };
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(Row::view).collect())
}

pub async fn latest(
    pool: &PgPool,
    platform: &str,
    channel: &str,
) -> Result<Option<AppRelease>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM app_releases
          WHERE platform=$1 AND channel=$2 AND published
          ORDER BY build DESC, created_at DESC LIMIT 1"
    ))
    .bind(platform)
    .bind(channel)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(Row::view))
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<AppRelease>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("SELECT {COLS} FROM app_releases WHERE id=$1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::view))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRelease {
    pub platform: String,
    #[serde(default = "default_channel")]
    pub channel: String,
    pub version: String,
    pub build: i32,
    pub download_url: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub force_update: bool,
    #[serde(default)]
    pub min_version: String,
    #[serde(default = "default_true")]
    pub published: bool,
    #[serde(default)]
    pub file_size: i64,
    #[serde(default)]
    pub sha256: String,
}

fn default_channel() -> String {
    "stable".into()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchRelease {
    pub version: Option<String>,
    pub build: Option<i32>,
    pub download_url: Option<String>,
    pub notes: Option<String>,
    pub force_update: Option<bool>,
    pub min_version: Option<String>,
    pub published: Option<bool>,
    pub file_size: Option<i64>,
    pub sha256: Option<String>,
}

pub fn validate(
    platform: &str,
    channel: &str,
    version: &str,
    build: i32,
    url: &str,
    notes: &str,
    sha: &str,
) -> Option<String> {
    if !PLATFORMS.contains(&platform) {
        return Some("平台不正确".into());
    }
    if !CHANNELS.contains(&channel) {
        return Some("通道不正确".into());
    }
    if version.trim().is_empty() || version.len() > 32 {
        return Some("版本号需为 1–32 字".into());
    }
    if build <= 0 {
        return Some("build 号必须大于 0".into());
    }
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with('/'))
        || url.len() > 1000
    {
        return Some("下载地址必须是 http(s) 或站内路径".into());
    }
    if notes.chars().count() > 2000 {
        return Some("更新说明不能超过 2000 字".into());
    }
    if !sha.is_empty() && (sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit())) {
        return Some("SHA-256 需为 64 位十六进制".into());
    }
    None
}

pub async fn create(pool: &PgPool, input: &NewRelease) -> Result<Option<AppRelease>, sqlx::Error> {
    let id = crate::ids::next('a');
    let done = sqlx::query(
        "INSERT INTO app_releases
             (id, platform, channel, version, build, download_url, notes, force_update,
              min_version, published, file_size, sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (platform, channel, build) DO NOTHING",
    )
    .bind(&id)
    .bind(input.platform.trim())
    .bind(input.channel.trim())
    .bind(input.version.trim())
    .bind(input.build)
    .bind(input.download_url.trim())
    .bind(input.notes.trim())
    .bind(input.force_update)
    .bind(input.min_version.trim())
    .bind(input.published)
    .bind(input.file_size.max(0))
    .bind(input.sha256.trim())
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Ok(None);
    }
    get(pool, &id).await
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: &PatchRelease,
) -> Result<Option<AppRelease>, sqlx::Error> {
    let Some(mut cur) = get(pool, id).await? else {
        return Ok(None);
    };
    if let Some(v) = &patch.version {
        cur.version = v.trim().to_string();
    }
    if let Some(v) = patch.build {
        cur.build = v;
    }
    if let Some(v) = &patch.download_url {
        cur.download_url = v.trim().to_string();
    }
    if let Some(v) = &patch.notes {
        cur.notes = v.clone();
    }
    if let Some(v) = patch.force_update {
        cur.force_update = v;
    }
    if let Some(v) = &patch.min_version {
        cur.min_version = v.trim().to_string();
    }
    if let Some(v) = patch.published {
        cur.published = v;
    }
    if let Some(v) = patch.file_size {
        cur.file_size = v.max(0);
    }
    if let Some(v) = &patch.sha256 {
        cur.sha256 = v.trim().to_string();
    }

    sqlx::query(
        "UPDATE app_releases SET version=$2, build=$3, download_url=$4, notes=$5,
                force_update=$6, min_version=$7, published=$8, file_size=$9, sha256=$10,
                updated_at=now() WHERE id=$1",
    )
    .bind(id)
    .bind(&cur.version)
    .bind(cur.build)
    .bind(&cur.download_url)
    .bind(&cur.notes)
    .bind(cur.force_update)
    .bind(&cur.min_version)
    .bind(cur.published)
    .bind(cur.file_size)
    .bind(&cur.sha256)
    .execute(pool)
    .await?;
    get(pool, id).await
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM app_releases WHERE id=$1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
