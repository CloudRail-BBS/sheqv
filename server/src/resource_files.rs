//! 资源文件存储。
//!
//! 配了对象存储就走 S3（流式上传/下载），否则落在 `$DATA_DIR/uploads/resources/`；
//! `storage` + `object_key` 决定读取路径，老数据（storage='fs'）不需要迁移。

use chrono::{DateTime, Utc};
use sqlx::PgPool;

pub const MAX_BYTES: usize = 100 * 1024 * 1024;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FileRow {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: i64,
    pub path: String,
    /// fs / s3
    pub storage: String,
    pub object_key: String,
    pub created_at: DateTime<Utc>,
}

pub async fn insert(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    name: &str,
    mime: &str,
    size: i64,
    path: &str,
    storage: &str,
    object_key: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO resource_files (id, user_id, name, mime, size, path, storage, object_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(id)
    .bind(user_id)
    .bind(name)
    .bind(mime)
    .bind(size)
    .bind(path)
    .bind(storage)
    .bind(object_key)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<FileRow>, sqlx::Error> {
    sqlx::query_as::<_, FileRow>(
        "SELECT id, name, mime, size, path, storage, object_key, created_at
           FROM resource_files WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// 后台文件管理：按文件名 / 用户搜索
pub async fn list(
    pool: &PgPool,
    q: &str,
    limit: i64,
) -> Result<Vec<(String, String, String, i64, String, String, DateTime<Utc>)>, sqlx::Error> {
    let like = format!("%{}%", q.trim());
    sqlx::query_as(
        "SELECT f.id, f.name, u.nickname, f.size, f.mime, f.storage, f.created_at
           FROM resource_files f
           LEFT JOIN users u ON u.id = f.user_id
          WHERE ($1 = '%%' OR f.name ILIKE $1 OR u.nickname ILIKE $1)
          ORDER BY f.created_at DESC
          LIMIT $2",
    )
    .bind(&like)
    .bind(limit.clamp(1, 200))
    .fetch_all(pool)
    .await
}

/// 删除一行，返回被删记录（调用方负责删对象 / 文件）
pub async fn remove(pool: &PgPool, id: &str) -> Result<Option<FileRow>, sqlx::Error> {
    sqlx::query_as::<_, FileRow>(
        "DELETE FROM resource_files WHERE id = $1
         RETURNING id, name, mime, size, path, storage, object_key, created_at",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}
