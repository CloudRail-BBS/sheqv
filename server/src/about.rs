//! 「关于社区」的人员与合作单位。
//!
//! 一个表两种 kind，读写都按 kind 过滤；排序先看 `sort`，再看创建时间，
//! 后台不填 sort 时新加的会排在后面。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub role: String,
    pub bio: String,
    pub avatar: String,
    pub url: String,
    pub sort: i32,
    pub visible: bool,
    pub created_at: DateTime<Utc>,
}

/// 前台只取可见项
pub async fn list(pool: &PgPool, kind: &str, only_visible: bool) -> Result<Vec<Entry>, sqlx::Error> {
    let sql = if only_visible {
        "SELECT id, kind, name, role, bio, avatar, url, sort, visible, created_at
           FROM about_entries WHERE kind = $1 AND visible ORDER BY sort ASC, created_at ASC"
    } else {
        "SELECT id, kind, name, role, bio, avatar, url, sort, visible, created_at
           FROM about_entries WHERE kind = $1 ORDER BY sort ASC, created_at ASC"
    };
    sqlx::query_as(sql).bind(kind).fetch_all(pool).await
}

pub struct EntryInput {
    pub kind: String,
    pub name: String,
    pub role: String,
    pub bio: String,
    pub avatar: String,
    pub url: String,
    pub sort: i32,
    pub visible: bool,
}

pub async fn create(pool: &PgPool, input: &EntryInput) -> Result<Entry, sqlx::Error> {
    sqlx::query_as(
        "INSERT INTO about_entries (id, kind, name, role, bio, avatar, url, sort, visible)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, kind, name, role, bio, avatar, url, sort, visible, created_at",
    )
    .bind(ids::next('a'))
    .bind(&input.kind)
    .bind(&input.name)
    .bind(&input.role)
    .bind(&input.bio)
    .bind(&input.avatar)
    .bind(&input.url)
    .bind(input.sort)
    .bind(input.visible)
    .fetch_one(pool)
    .await
}

/// 局部更新：只覆盖传进来的字段
pub async fn update(
    pool: &PgPool,
    id: &str,
    fields: &serde_json::Map<String, serde_json::Value>,
) -> Result<Option<Entry>, sqlx::Error> {
    if fields.is_empty() {
        return find(pool, id).await;
    }

    // 白名单拼 SQL：键名不来自用户，值全部走绑定
    let mut sets: Vec<String> = Vec::new();
    for (i, key) in ["name", "role", "bio", "avatar", "url"]
        .iter()
        .filter(|k| fields.contains_key(**k))
        .enumerate()
    {
        sets.push(format!("{key} = ${}", i + 2));
    }
    if fields.contains_key("sort") {
        sets.push(format!("sort = ${}", sets.len() + 2));
    }
    if fields.contains_key("visible") {
        sets.push(format!("visible = ${}", sets.len() + 2));
    }

    let sql = format!(
        "UPDATE about_entries SET {} WHERE id = $1
         RETURNING id, kind, name, role, bio, avatar, url, sort, visible, created_at",
        sets.join(", ")
    );
    let mut q = sqlx::query_as::<_, Entry>(&sql).bind(id);
    for key in ["name", "role", "bio", "avatar", "url"] {
        if let Some(v) = fields.get(key).and_then(|v| v.as_str()) {
            q = q.bind(v.to_string());
        }
    }
    if let Some(v) = fields.get("sort").and_then(|v| v.as_i64()) {
        q = q.bind(v as i32);
    }
    if let Some(v) = fields.get("visible").and_then(|v| v.as_bool()) {
        q = q.bind(v);
    }
    Ok(q.fetch_optional(pool).await?)
}

pub async fn find(pool: &PgPool, id: &str) -> Result<Option<Entry>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, kind, name, role, bio, avatar, url, sort, visible, created_at
           FROM about_entries WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("DELETE FROM about_entries WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}
