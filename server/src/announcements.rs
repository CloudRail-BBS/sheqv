//! 公告：后台 CRUD，前台只看 `published`；置顶排最前。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

pub const KINDS: [&str; 4] = ["rule", "version", "activity", "system"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Announcement {
    pub id: String,
    pub title: String,
    pub body: String,
    pub kind: String,
    pub pinned: bool,
    pub published: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    title: String,
    body: String,
    kind: String,
    pinned: bool,
    published: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl Row {
    fn view(self) -> Announcement {
        Announcement {
            id: self.id,
            title: self.title,
            body: self.body,
            kind: self.kind,
            pinned: self.pinned,
            published: self.published,
            created_at: self.created_at.timestamp_millis(),
            updated_at: self.updated_at.timestamp_millis(),
        }
    }
}

const COLS: &str = "id, title, body, kind, pinned, published, created_at, updated_at";

pub fn validate(title: &str, body: &str) -> Option<&'static str> {
    let title_len = title.chars().count();
    let body_len = body.chars().count();
    if !(2..=60).contains(&title_len) {
        return Some("标题需 2–60 字");
    }
    if body_len < 4 {
        return Some("正文至少 4 字");
    }
    if body_len > 20000 {
        return Some("正文不超过 20000 字");
    }
    None
}

pub fn normalize_kind(kind: &str) -> String {
    if KINDS.contains(&kind.trim()) {
        kind.trim().to_string()
    } else {
        "system".to_string()
    }
}

pub async fn list(pool: &PgPool) -> Result<Vec<Announcement>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM announcements ORDER BY pinned DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::view).collect())
}

pub async fn list_published(pool: &PgPool) -> Result<Vec<Announcement>, sqlx::Error> {
    Ok(list(pool)
        .await?
        .into_iter()
        .filter(|a| a.published)
        .collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Announcement>, sqlx::Error> {
    let row: Option<Row> =
        sqlx::query_as(&format!("SELECT {COLS} FROM announcements WHERE id = $1"))
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(Row::view))
}

pub async fn create(
    pool: &PgPool,
    title: &str,
    body: &str,
    kind: &str,
    pinned: bool,
    published: bool,
) -> Result<Announcement, sqlx::Error> {
    let id = format!("n{}", Utc::now().timestamp_millis().max(0));
    sqlx::query(
        "INSERT INTO announcements (id, title, body, kind, pinned, published) VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(&id)
    .bind(title)
    .bind(body)
    .bind(normalize_kind(kind))
    .bind(pinned)
    .bind(published)
    .execute(pool)
    .await?;

    get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// 只改传进来的字段（`None` = 不改）
pub struct Patch<'a> {
    pub title: Option<&'a str>,
    pub body: Option<&'a str>,
    pub kind: Option<&'a str>,
    pub pinned: Option<bool>,
    pub published: Option<bool>,
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: Patch<'_>,
) -> Result<Option<Announcement>, sqlx::Error> {
    let kind = patch.kind.map(normalize_kind);
    let row: Option<Row> = sqlx::query_as(&format!(
        "UPDATE announcements SET
            title = COALESCE($2, title),
            body = COALESCE($3, body),
            kind = COALESCE($4, kind),
            pinned = COALESCE($5, pinned),
            published = COALESCE($6, published),
            updated_at = now()
         WHERE id = $1 RETURNING {COLS}"
    ))
    .bind(id)
    .bind(patch.title)
    .bind(patch.body)
    .bind(kind)
    .bind(patch.pinned)
    .bind(patch.published)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(Row::view))
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("DELETE FROM announcements WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}
