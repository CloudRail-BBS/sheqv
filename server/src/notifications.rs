//! 站内信：**两类合并**。
//!
//! 1. 业务事件（本文件 `push()` 写入 `notifications` 表）：礼品卡到账、头衔/报名/服务器审核结果等；
//! 2. 互动聚合（评论）：仍然按 `users.notif_read_at` 水位算未读，不落行。
//!
//! 合成一条时间线返回，前端只认 `kind / title / text / href`，不区分来源。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::users::PublicUser;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub text: String,
    pub at: i64,
    pub href: String,
    pub unread: bool,
}

/// 写一条业务通知。调用方自己保证 user_id 存在（外键会兜底）。
pub async fn push(
    pool: &PgPool,
    user_id: &str,
    kind: &str,
    title: &str,
    body: &str,
    href: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO notifications (id, user_id, kind, title, body, href)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(crate::ids::next('n'))
    .bind(user_id)
    .bind(kind)
    .bind(title.trim())
    .bind(body.trim())
    .bind(href.trim())
    .execute(pool)
    .await?;
    Ok(())
}

/// 把某个人的业务通知全部标为已读；返回影响行数
pub async fn mark_all_read(pool: &PgPool, user_id: &str) -> Result<u64, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    body: String,
    created_at: DateTime<Utc>,
    author: String,
    post_id: String,
    post_title: Option<String>,
}

/// 返回 (评论通知, 未读数)。自己发的评论不通知自己。
pub async fn feed(
    pool: &PgPool,
    user: Option<&PublicUser>,
) -> Result<(Vec<Note>, usize), sqlx::Error> {
    let viewer = user.map(|u| u.id.clone()).unwrap_or_default();
    let read_at = user.and_then(|u| u.notif_read_at).unwrap_or(0);

    let rows: Vec<Row> = sqlx::query_as(
        "SELECT c.id, c.body, c.created_at, u.nickname AS author, p.id AS post_id, p.title AS post_title
           FROM comments c
           JOIN users u ON u.id = c.author_id
           JOIN posts p ON p.id = c.post_id
          WHERE p.author_id = $1 AND c.author_id <> $1
          ORDER BY c.created_at DESC
          LIMIT 30",
    )
    .bind(&viewer)
    .fetch_all(pool)
    .await?;

    let mut unread = 0usize;
    let items: Vec<Note> = rows
        .into_iter()
        .map(|r| {
            let at = r.created_at.timestamp_millis();
            let title = r.post_title.unwrap_or_default();
            let title = if title.is_empty() {
                "你的帖子".to_string()
            } else {
                title
            };
            let preview: String = r.body.chars().take(40).collect();
            let is_unread = at > read_at;
            if is_unread {
                unread += 1;
            }
            Note {
                id: r.id,
                kind: "comment".to_string(),
                text: format!("{} 评论了《{}》：{}", r.author, title, preview),
                title: r.author,
                at,
                href: format!("/p/{}", r.post_id),
                unread: is_unread,
            }
        })
        .collect();

    // 业务通知：与评论合并成一条时间线
    let mut items = items;
    if !viewer.is_empty() {
        let rows: Vec<(String, String, String, String, String, Option<DateTime<Utc>>, DateTime<Utc>)> =
            sqlx::query_as(
                "SELECT id, kind, title, body, href, read_at, created_at
                   FROM notifications WHERE user_id = $1
                  ORDER BY created_at DESC LIMIT 30",
            )
            .bind(&viewer)
            .fetch_all(pool)
            .await?;

        for (id, kind, title, body, href, read_at, created_at) in rows {
            let is_unread = read_at.is_none();
            if is_unread {
                unread += 1;
            }
            items.push(Note {
                id,
                kind,
                title,
                text: body,
                at: created_at.timestamp_millis(),
                href,
                unread: is_unread,
            });
        }
    }

    items.sort_by(|a, b| b.at.cmp(&a.at));
    items.truncate(30);
    Ok((items, unread))
}

/// 现在时间（毫秒），路由层给「未登录也要返回稳定结构」用
pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}
