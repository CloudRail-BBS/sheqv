//! 站内信聚合：目前只有「别人在我的帖子下的评论」。
//!
//! 比赛相关的待处理提醒依赖 `MATCHES`（仍是前端 mock 数据），
//! 等约战模块落到数据库时再补 `pending`，接口形状保持不变。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::users::PublicUser;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub kind: &'static str,
    pub title: String,
    pub text: String,
    pub at: i64,
    pub href: String,
    pub unread: bool,
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
    let items = rows
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
                kind: "comment",
                text: format!("{} 评论了《{}》：{}", r.author, title, preview),
                title: r.author,
                at,
                href: format!("/p/{}", r.post_id),
                unread: is_unread,
            }
        })
        .collect();

    Ok((items, unread))
}

/// 现在时间（毫秒），路由层给「未登录也要返回稳定结构」用
pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}
