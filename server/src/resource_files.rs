//! 资源文件的本地存储：上传到 `$DATA_DIR/uploads/resources/`，下载走同源接口。

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
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO resource_files (id, user_id, name, mime, size, path)
         VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(id)
    .bind(user_id)
    .bind(name)
    .bind(mime)
    .bind(size)
    .bind(path)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<FileRow>, sqlx::Error> {
    sqlx::query_as::<_, FileRow>(
        "SELECT id, name, mime, size, path, created_at FROM resource_files WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}
