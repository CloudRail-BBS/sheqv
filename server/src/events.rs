//! 活动：一个时间段 + 一段说明 + 一个奖励，用户点「参加」即算报名。
//!
//! 比赛事轻一层：不审核、不分对阵，只记录谁来过。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub cover: String,
    pub reward: String,
    pub starts_at: Option<DateTime<Utc>>,
    pub ends_at: Option<DateTime<Utc>>,
    pub status: String,
    pub sort: i32,
    /// 已报名人数
    pub entry_count: i64,
    /// 当前用户是否已参加（未登录恒为 false）
    pub joined: bool,
}

const COLS: &str = "e.id, e.title, e.summary, e.body, e.cover, e.reward,
    e.starts_at, e.ends_at, e.status, e.sort,
    (SELECT count(*) FROM event_entries x WHERE x.event_id = e.id)::bigint AS entry_count,
    ($1::text IS NOT NULL AND EXISTS(
        SELECT 1 FROM event_entries y WHERE y.event_id = e.id AND y.user_id = $1
    )) AS joined";

pub async fn list(pool: &PgPool, user_id: Option<&str>) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLS} FROM events e
          WHERE e.status <> 'draft'
          ORDER BY (e.status = 'open') DESC, e.sort ASC, e.starts_at DESC NULLS LAST, e.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn admin_list(pool: &PgPool, user_id: Option<&str>) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLS} FROM events e ORDER BY e.sort ASC, e.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, id: &str, user_id: Option<&str>) -> Result<Option<Event>, sqlx::Error> {
    sqlx::query_as(&format!("SELECT {COLS} FROM events e WHERE e.id = $2"))
    .bind(user_id)
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub struct NewEvent<'a> {
    pub title: &'a str,
    pub summary: &'a str,
    pub body: &'a str,
    pub cover: &'a str,
    pub reward: &'a str,
    pub starts_at: Option<DateTime<Utc>>,
    pub ends_at: Option<DateTime<Utc>>,
    pub status: &'a str,
    pub sort: i64,
}

pub async fn create(pool: &PgPool, e: &NewEvent<'_>) -> Result<String, sqlx::Error> {
    let id = ids::next('e');
    sqlx::query(
        "INSERT INTO events (id, title, summary, body, cover, reward, starts_at, ends_at, status, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(&id)
    .bind(e.title.trim())
    .bind(e.summary.trim())
    .bind(e.body)
    .bind(e.cover.trim())
    .bind(e.reward.trim())
    .bind(e.starts_at)
    .bind(e.ends_at)
    .bind(e.status)
    .bind(e.sort as i32)
    .execute(pool)
    .await?;
    Ok(id)
}

pub struct PatchEvent<'a> {
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub body: Option<&'a str>,
    pub cover: Option<&'a str>,
    pub reward: Option<&'a str>,
    pub status: Option<&'a str>,
    pub sort: Option<i64>,
    /// 传 Some(None) 表示清空时间
    pub starts_at: Option<Option<DateTime<Utc>>>,
    pub ends_at: Option<Option<DateTime<Utc>>>,
}

pub async fn patch(pool: &PgPool, id: &str, p: &PatchEvent<'_>) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE events SET
            title = COALESCE($2, title),
            summary = COALESCE($3, summary),
            body = COALESCE($4, body),
            cover = COALESCE($5, cover),
            reward = COALESCE($6, reward),
            status = COALESCE($7, status),
            sort = COALESCE($8, sort),
            starts_at = CASE WHEN $9::boolean THEN $10 ELSE starts_at END,
            ends_at = CASE WHEN $11::boolean THEN $12 ELSE ends_at END
          WHERE id = $1",
    )
    .bind(id)
    .bind(p.title.map(str::trim))
    .bind(p.summary.map(str::trim))
    .bind(p.body)
    .bind(p.cover.map(str::trim))
    .bind(p.reward.map(str::trim))
    .bind(p.status)
    .bind(p.sort.map(|v| v as i32))
    .bind(p.starts_at.is_some())
    .bind(p.starts_at.flatten())
    .bind(p.ends_at.is_some())
    .bind(p.ends_at.flatten())
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM events WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

pub enum JoinError {
    NotFound,
    Closed,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for JoinError {
    fn from(e: sqlx::Error) -> Self {
        JoinError::Db(e)
    }
}

/// 参加活动：活动必须存在且处于 open；重复参加按幂等处理（不报错）。
pub async fn join(pool: &PgPool, user_id: &str, event_id: &str) -> Result<(), JoinError> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_optional(pool)
        .await?;
    match status.as_deref() {
        None => return Err(JoinError::NotFound),
        Some("open") => {}
        Some(_) => return Err(JoinError::Closed),
    }

    sqlx::query(
        "INSERT INTO event_entries (id, event_id, user_id) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id) DO NOTHING",
    )
    .bind(ids::next('v'))
    .bind(event_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn leave(pool: &PgPool, user_id: &str, event_id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM event_entries WHERE event_id = $1 AND user_id = $2")
        .bind(event_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
