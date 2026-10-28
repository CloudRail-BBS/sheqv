//! 一对一私聊。
//!
//! 两处设计取舍：
//! 1. 会话按「两个 user id 字典序」唯一（`user_a < user_b`），一对人只有一条记录，
//!    不用再查两个方向。
//! 2. 已读是**位点**不是逐条标记：`a_read_at` / `b_read_at` 各存一个时间，
//!    未读靠 `count(*) where created_at > 我的位点 and sender <> 我` 算。
//!    标已读因此永远是一次 UPDATE。
//!
//! 权限只有一条：**能不能看到某条会话，只看你是不是这两个 user 之一**，
//! 所有 SQL 都带 `user_a = $me OR user_b = $me`，不接受「传个 conv id 就读」。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::cache::Cache;
use crate::ids;

/// 每分钟最多发多少条，超过就拒绝（防刷屏）
pub const RATE_PER_MINUTE: i64 = 30;
/// 正文上限，与前端计数器一致
pub const MAX_BODY: usize = 2000;
/// 单次拉取的消息条数
pub const PAGE: i64 = 40;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub nickname: String,
    pub avatar: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub peer: Peer,
    pub last_at: i64,
    pub last_preview: String,
    /// 最后一条是不是我发的（列表里显示「我：…」）
    pub last_mine: bool,
    pub unread: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub body: String,
    pub at: i64,
    pub mine: bool,
}

/// 字典序排队，保证同一对人落同一行
fn pair(me: &str, peer: &str) -> (String, String) {
    if me < peer {
        (me.to_string(), peer.to_string())
    } else {
        (peer.to_string(), me.to_string())
    }
}

/// 会话列表（按最后一条消息倒序）
pub async fn list(pool: &PgPool, me: &str) -> Result<Vec<Conversation>, sqlx::Error> {
    let rows: Vec<(String, DateTime<Utc>, String, String, String, String, String, i64)> =
        sqlx::query_as(
            "SELECT c.user_b AS peer_id, c.last_at, c.last_preview, c.last_sender,
                    u.nickname, u.avatar,
                    c.id,
                    (SELECT count(*) FROM dm_messages m
                      WHERE m.conv_id = c.id AND m.sender_id <> $1
                        AND m.created_at > c.a_read_at) AS unread
               FROM dm_conversations c
               JOIN users u ON u.id = c.user_b
              WHERE c.user_a = $1
              UNION ALL
             SELECT c.user_a AS peer_id, c.last_at, c.last_preview, c.last_sender,
                    u.nickname, u.avatar,
                    c.id,
                    (SELECT count(*) FROM dm_messages m
                      WHERE m.conv_id = c.id AND m.sender_id <> $1
                        AND m.created_at > c.b_read_at) AS unread
               FROM dm_conversations c
               JOIN users u ON u.id = c.user_a
              WHERE c.user_b = $1
              ORDER BY 2 DESC
              LIMIT 100",
        )
        .bind(me)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|(peer_id, last_at, preview, sender, nickname, avatar, _conv, unread)| Conversation {
            last_mine: sender == me,
            peer: Peer { id: peer_id, nickname, avatar },
            last_at: last_at.timestamp_millis(),
            last_preview: preview,
            unread,
        })
        .collect())
}

/// 会话 id：不存在时返回 None（读不创建会话）
async fn conv_id(
    pool: &PgPool,
    me: &str,
    peer: &str,
) -> Result<Option<(String, DateTime<Utc>)>, sqlx::Error> {
    let (a, b) = pair(me, peer);
    let row: Option<(String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, CASE WHEN user_a = $1 THEN a_read_at ELSE b_read_at END
           FROM dm_conversations WHERE user_a = $1 AND user_b = $2",
    )
    .bind(&a)
    .bind(&b)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// 取对话内容。`before` 是毫秒时间戳，用于向上翻页。
pub async fn thread(
    pool: &PgPool,
    me: &str,
    peer: &str,
    before: Option<i64>,
) -> Result<Vec<Message>, sqlx::Error> {
    let Some((id, _)) = conv_id(pool, me, peer).await? else {
        return Ok(Vec::new());
    };

    let rows: Vec<(String, String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, sender_id, body, created_at
           FROM dm_messages
          WHERE conv_id = $1 AND ($2::bigint IS NULL OR created_at < to_timestamp($2::bigint / 1000.0))
          ORDER BY created_at DESC
          LIMIT $3",
    )
    .bind(&id)
    .bind(before)
    .bind(PAGE)
    .fetch_all(pool)
    .await?;

    // 查询是倒序（取最近 N 条），展示要正序
    let mut out: Vec<Message> = rows
        .into_iter()
        .map(|(mid, sender, body, at)| Message {
            id: mid,
            body,
            at: at.timestamp_millis(),
            mine: sender == me,
        })
        .collect();
    out.reverse();
    Ok(out)
}

/// 发消息。会话不存在就建。
pub async fn send(
    pool: &PgPool,
    cache: &Cache,
    me: &str,
    peer: &str,
    body: &str,
) -> Result<Message, SendError> {
    let text = body.trim();
    if text.is_empty() {
        return Err(SendError::Empty);
    }
    if text.chars().count() > MAX_BODY {
        return Err(SendError::TooLong);
    }
    if me == peer {
        return Err(SendError::SelfTalk);
    }

    // 限流：走缓存计数（Redis 或进程内），不再每发一条都 count 一次表
    let hits = cache
        .incr(&format!("rl:dm:{me}"), std::time::Duration::from_secs(60))
        .await;
    if hits > RATE_PER_MINUTE {
        return Err(SendError::TooFast);
    }

    let (a, b) = pair(me, peer);
    let mut tx = pool.begin().await.map_err(SendError::Db)?;

    let (cid,): (String,) = sqlx::query_as(
        "INSERT INTO dm_conversations (id, user_a, user_b)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = dm_conversations.user_a
         RETURNING id",
    )
    .bind(ids::next('c'))
    .bind(&a)
    .bind(&b)
    .fetch_one(&mut *tx)
    .await
    .map_err(SendError::Db)?;

    let mid = ids::next('d');
    let (created_at,): (DateTime<Utc>,) = sqlx::query_as(
        "INSERT INTO dm_messages (id, conv_id, sender_id, body)
         VALUES ($1, $2, $3, $4) RETURNING created_at",
    )
    .bind(&mid)
    .bind(&cid)
    .bind(me)
    .bind(text)
    .fetch_one(&mut *tx)
    .await
    .map_err(SendError::Db)?;

    let preview: String = text.chars().take(60).collect();
    sqlx::query(
        "UPDATE dm_conversations
            SET last_at = $2, last_preview = $3, last_sender = $4,
                a_read_at = CASE WHEN user_a = $4 THEN $2 ELSE a_read_at END,
                b_read_at = CASE WHEN user_b = $4 THEN $2 ELSE b_read_at END
          WHERE id = $1",
    )
    .bind(&cid)
    .bind(created_at)
    .bind(&preview)
    .bind(me)
    .execute(&mut *tx)
    .await
    .map_err(SendError::Db)?;

    tx.commit().await.map_err(SendError::Db)?;

    Ok(Message {
        id: mid,
        body: text.to_string(),
        at: created_at.timestamp_millis(),
        mine: true,
    })
}

/// 把「我」的已读位点推到最新一条
pub async fn mark_read(pool: &PgPool, me: &str, peer: &str) -> Result<(), sqlx::Error> {
    let (a, b) = pair(me, peer);
    sqlx::query(
        "UPDATE dm_conversations
            SET a_read_at = CASE WHEN user_a = $3 THEN now() ELSE a_read_at END,
                b_read_at = CASE WHEN user_b = $3 THEN now() ELSE b_read_at END
          WHERE user_a = $1 AND user_b = $2",
    )
    .bind(&a)
    .bind(&b)
    .bind(me)
    .execute(pool)
    .await?;
    Ok(())
}

/// 总未读（顶栏与侧栏用）
pub async fn unread_total(pool: &PgPool, me: &str) -> Result<i64, sqlx::Error> {
    let n: i64 = sqlx::query_scalar(
        "SELECT count(*)
           FROM dm_messages m
           JOIN dm_conversations c ON c.id = m.conv_id
          WHERE m.sender_id <> $1
            AND ((c.user_a = $1 AND m.created_at > c.a_read_at)
              OR (c.user_b = $1 AND m.created_at > c.b_read_at))",
    )
    .bind(me)
    .fetch_one(pool)
    .await?;
    Ok(n)
}

pub enum SendError {
    Empty,
    TooLong,
    SelfTalk,
    TooFast,
    Db(sqlx::Error),
}
