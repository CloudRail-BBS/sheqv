//! 工单：用户提交 → 管理员回复 / 关闭。
//!
//! 与私信的区别：工单有分类、状态与处理记录，后台能按「待处理 / 已回复 / 已关闭」排队，
//! 用户也能看到每一次回复的时间线。消息不落已读位点，靠 `last_role` 判断最后说话的是谁。

use serde::Serialize;
use sqlx::PgPool;

use crate::notifications;

pub const CATEGORIES: [&str; 5] = ["account", "report", "bug", "suggestion", "other"];
pub const STATUSES: [&str; 3] = ["open", "replied", "closed"];

pub const SUBJECT_MIN: usize = 2;
pub const SUBJECT_MAX: usize = 80;
pub const BODY_MIN: usize = 2;
pub const BODY_MAX: usize = 2000;
/// 一人一天最多开 10 张，防止刷屏
pub const DAILY_LIMIT: i64 = 10;

pub fn valid_category(v: &str) -> bool {
    CATEGORIES.contains(&v)
}

pub fn valid_status(v: &str) -> bool {
    STATUSES.contains(&v)
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TicketView {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub avatar: String,
    pub category: String,
    pub subject: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: i64,
    /// 最后一条消息的摘要与角色，列表里显示「谁在等谁」
    pub last_message: String,
    pub last_role: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageView {
    pub id: String,
    pub role: String,
    pub author: String,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketDetail {
    #[serde(flatten)]
    pub ticket: TicketView,
    pub messages: Vec<MessageView>,
}

pub enum TicketError {
    NotFound,
    Closed,
    Limit,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for TicketError {
    fn from(e: sqlx::Error) -> Self {
        TicketError::Db(e)
    }
}

const COLS: &str = "t.id, t.user_id, u.nickname, u.avatar, t.category, t.subject, t.status,
        (extract(epoch FROM t.created_at) * 1000)::bigint AS created_at,
        (extract(epoch FROM t.updated_at) * 1000)::bigint AS updated_at,
        COALESCE(m.cnt, 0)::bigint AS message_count,
        COALESCE(l.body, '') AS last_message,
        COALESCE(l.role, '') AS last_role";

const FROM: &str = "FROM tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN LATERAL (
            SELECT count(*) AS cnt FROM ticket_messages WHERE ticket_id = t.id
        ) m ON true
        LEFT JOIN LATERAL (
            SELECT body, role FROM ticket_messages
             WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1
        ) l ON true";

/// `user_id` 为空表示后台看全部；`status` 为空表示全部状态
pub async fn list(
    pool: &PgPool,
    user_id: &str,
    status: &str,
    limit: i64,
) -> Result<Vec<TicketView>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLS} {FROM}
          WHERE ($1 = '' OR t.user_id = $1) AND ($2 = '' OR t.status = $2)
          ORDER BY (t.status <> 'closed') DESC, t.updated_at DESC
          LIMIT $3"
    ))
    .bind(user_id)
    .bind(status)
    .bind(limit.clamp(1, 200))
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<TicketDetail>, sqlx::Error> {
    let ticket: Option<TicketView> = sqlx::query_as(&format!(
        "SELECT {COLS} {FROM} WHERE t.id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    let Some(ticket) = ticket else {
        return Ok(None);
    };

    let messages: Vec<MessageView> = sqlx::query_as(
        "SELECT m.id, m.role,
                COALESCE(u.nickname,
                         CASE WHEN m.role = 'admin' THEN '管理员' ELSE '已注销用户' END) AS author,
                m.body,
                (extract(epoch FROM m.created_at) * 1000)::bigint AS created_at
           FROM ticket_messages m
           LEFT JOIN users u ON u.id = m.author_id
          WHERE m.ticket_id = $1
          ORDER BY m.created_at ASC, m.id ASC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(Some(TicketDetail { ticket, messages }))
}

pub async fn create(
    pool: &PgPool,
    user_id: &str,
    category: &str,
    subject: &str,
    body: &str,
) -> Result<String, TicketError> {
    if !valid_category(category) {
        return Err(TicketError::Invalid("请选择工单分类".into()));
    }
    let subject = subject.trim();
    let body = body.trim();
    let sl = subject.chars().count();
    if !(SUBJECT_MIN..=SUBJECT_MAX).contains(&sl) {
        return Err(TicketError::Invalid(format!(
            "标题需要 {SUBJECT_MIN}–{SUBJECT_MAX} 个字"
        )));
    }
    let bl = body.chars().count();
    if !(BODY_MIN..=BODY_MAX).contains(&bl) {
        return Err(TicketError::Invalid(format!(
            "问题描述需要 {BODY_MIN}–{BODY_MAX} 个字"
        )));
    }

    let today: i64 = sqlx::query_scalar(
        "SELECT count(*)::bigint FROM tickets
          WHERE user_id = $1 AND created_at > now() - interval '1 day'",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    if today >= DAILY_LIMIT {
        return Err(TicketError::Limit);
    }

    let id = crate::ids::next('k');
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO tickets (id, user_id, category, subject)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(category)
    .bind(subject)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO ticket_messages (id, ticket_id, author_id, role, body)
         VALUES ($1, $2, $3, 'user', $4)",
    )
    .bind(crate::ids::next('m'))
    .bind(&id)
    .bind(user_id)
    .bind(body)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    notify_admins(
        pool,
        "新工单",
        &format!("「{subject}」等待处理"),
        "/admin/tickets",
    )
    .await;
    Ok(id)
}

/// 回复。管理员回复把状态推成 replied，用户追问把状态推回 open。
pub async fn reply(
    pool: &PgPool,
    ticket_id: &str,
    author_id: Option<&str>,
    role: &str,
    body: &str,
) -> Result<(), TicketError> {
    let body = body.trim();
    let len = body.chars().count();
    if len == 0 || len > BODY_MAX {
        return Err(TicketError::Invalid(format!("回复内容需在 1–{BODY_MAX} 字")));
    }

    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT user_id, status, subject FROM tickets WHERE id = $1")
            .bind(ticket_id)
            .fetch_optional(pool)
            .await?;
    let Some((owner, status, subject)) = row else {
        return Err(TicketError::NotFound);
    };
    if status == "closed" {
        return Err(TicketError::Closed);
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO ticket_messages (id, ticket_id, author_id, role, body)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(crate::ids::next('m'))
    .bind(ticket_id)
    .bind(author_id)
    .bind(role)
    .bind(body)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE tickets
            SET status = $2, updated_at = now()
          WHERE id = $1",
    )
    .bind(ticket_id)
    .bind(if role == "admin" { "replied" } else { "open" })
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let brief: String = body.chars().take(60).collect();
    if role == "admin" {
        let _ = notifications::push(
            pool,
            &owner,
            "ticket",
            "工单有新回复",
            &format!("「{subject}」：{brief}"),
            &format!("/tickets/{ticket_id}"),
        )
        .await;
    } else {
        notify_admins(
            pool,
            "工单有新消息",
            &format!("「{subject}」：{brief}"),
            "/admin/tickets",
        )
        .await;
    }
    Ok(())
}

pub async fn set_status(pool: &PgPool, id: &str, status: &str) -> Result<bool, TicketError> {
    if !valid_status(status) {
        return Err(TicketError::Invalid("状态不合法".into()));
    }
    let done = sqlx::query(
        "UPDATE tickets
            SET status = $2, updated_at = now(),
                closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END
          WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

async fn notify_admins(pool: &PgPool, title: &str, body: &str, href: &str) {
    let ids: Vec<String> = match sqlx::query_scalar(
        "SELECT id FROM users WHERE role = 'admin' AND NOT banned",
    )
    .fetch_all(pool)
    .await
    {
        Ok(v) => v,
        Err(_) => return,
    };
    for id in ids {
        let _ = notifications::push(pool, &id, "ticket", title, body, href).await;
    }
}
