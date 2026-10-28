//! 头衔申请：用户提交 → 管理员审核 → 通过才写到 `users.title`。
//!
//! 为什么不让用户直接改：头衔会出现在帖子、评论、名片的作者名旁边，
//! 等于一个全站可见的展示位；开放自填就只能靠保留字黑名单，防不住冒充。
//! 改成申请制后，样式也从后台给的调色板里选，观感统一。
//!
//! 一人同时只能有一条 `pending`（唯一索引兜底），被拒之后可以再提。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::users;

/// 可选样式。键与 CSS 里的 `[data-bs="…"]` 对应。
pub const STYLES: [&str; 8] = [
    "plain", "blue", "gold", "violet", "mint", "solid", "outline", "holo",
];
/// 可选特效；空串 = 无
pub const EFFECTS: [&str; 4] = ["", "shine", "glow", "pulse"];

pub const STATUSES: [&str; 3] = ["pending", "approved", "rejected"];

pub fn valid_style(v: &str) -> bool {
    STYLES.contains(&v)
}

pub fn valid_effect(v: &str) -> bool {
    EFFECTS.contains(&v)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestView {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub title: String,
    pub style: String,
    pub effect: String,
    pub reason: String,
    pub status: String,
    pub review_note: String,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    user_id: String,
    nickname: String,
    title: String,
    style: String,
    effect: String,
    reason: String,
    status: String,
    review_note: String,
    created_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
}

impl Row {
    fn into_view(self) -> RequestView {
        RequestView {
            id: self.id,
            user_id: self.user_id,
            nickname: self.nickname,
            title: self.title,
            style: self.style,
            effect: self.effect,
            reason: self.reason,
            status: self.status,
            review_note: self.review_note,
            created_at: self.created_at.timestamp_millis(),
            reviewed_at: self.reviewed_at.map(|t| t.timestamp_millis()),
        }
    }
}

const COLS: &str = "r.id, r.user_id, u.nickname, r.title, r.style, r.effect, r.reason,
        r.status, r.review_note, r.created_at, r.reviewed_at";

pub enum TitleError {
    NotFound,
    AlreadyPending,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for TitleError {
    fn from(e: sqlx::Error) -> Self {
        TitleError::Db(e)
    }
}

/// 本人的申请记录（新的在前，最多 10 条）
pub async fn list_mine(pool: &PgPool, user_id: &str) -> Result<Vec<RequestView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM title_requests r JOIN users u ON u.id = r.user_id
          WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 10"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

/// 后台列表：待审在最前，可按状态筛
pub async fn admin_list(pool: &PgPool, status: &str) -> Result<Vec<RequestView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM title_requests r JOIN users u ON u.id = r.user_id
          WHERE ($1 = '' OR r.status = $1)
          ORDER BY (r.status = 'pending') DESC, r.created_at DESC
          LIMIT 200"
    ))
    .bind(status)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

pub async fn create(
    pool: &PgPool,
    user_id: &str,
    is_admin: bool,
    title: &str,
    style: &str,
    effect: &str,
    reason: &str,
) -> Result<RequestView, TitleError> {
    let clean = users::normalize_title(title, is_admin).map_err(TitleError::Invalid)?;
    if clean.is_empty() {
        return Err(TitleError::Invalid("请填写要申请的头衔".into()));
    }
    if !valid_style(style) {
        return Err(TitleError::Invalid("样式不在可选范围".into()));
    }
    if !valid_effect(effect) {
        return Err(TitleError::Invalid("特效不在可选范围".into()));
    }
    if reason.chars().count() > 200 {
        return Err(TitleError::Invalid("申请说明不能超过 200 字".into()));
    }

    let pending: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM title_requests WHERE user_id = $1 AND status = 'pending'",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if pending.is_some() {
        return Err(TitleError::AlreadyPending);
    }

    let row: Row = sqlx::query_as(&format!(
        "WITH ins AS (
             INSERT INTO title_requests (id, user_id, title, style, effect, reason)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *
         )
         SELECT {COLS} FROM ins r JOIN users u ON u.id = r.user_id"
    ))
    .bind(crate::ids::next('q'))
    .bind(user_id)
    .bind(clean)
    .bind(style)
    .bind(effect)
    .bind(reason.trim())
    .fetch_one(pool)
    .await?;
    Ok(row.into_view())
}

/// 撤销自己待审的申请
pub async fn cancel(pool: &PgPool, user_id: &str, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE title_requests SET status = 'cancelled'
          WHERE id = $1 AND user_id = $2 AND status = 'pending'",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

pub struct Review<'a> {
    pub status: &'a str,
    pub note: &'a str,
    /// 审核时可以改文案与样式（用户填的不一定合适）
    pub title: Option<&'a str>,
    pub style: Option<&'a str>,
    pub effect: Option<&'a str>,
    pub reviewer: Option<&'a str>,
}

/// 审核。通过时把最终文案与样式写进 `users`，被拒只留记录。
pub async fn review(pool: &PgPool, id: &str, input: &Review<'_>) -> Result<bool, TitleError> {
    if !STATUSES.contains(&input.status) {
        return Err(TitleError::Invalid("状态不合法".into()));
    }
    let row: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT user_id, title, style, effect FROM title_requests WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    let Some((user_id, cur_title, cur_style, cur_effect)) = row else {
        return Err(TitleError::NotFound);
    };

    let title = input.title.map(str::trim).unwrap_or(&cur_title);
    let style = input.style.filter(|s| valid_style(s)).unwrap_or(&cur_style);
    let effect = input
        .effect
        .filter(|s| valid_effect(s))
        .unwrap_or(&cur_effect);

    let done = sqlx::query(
        "UPDATE title_requests
            SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
                title = $5, style = $6, effect = $7
          WHERE id = $1 AND status = 'pending'",
    )
    .bind(id)
    .bind(input.status)
    .bind(input.note.trim())
    .bind(input.reviewer)
    .bind(title)
    .bind(style)
    .bind(effect)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Err(TitleError::Invalid("这条申请已经处理过了".into()));
    }

    if input.status == "approved" {
        users::set_title_styled(pool, &user_id, title, style, effect)
            .await
            .map_err(TitleError::Db)?;
        let _ = crate::notifications::push(
            pool,
            &user_id,
            "title",
            "头衔申请已通过",
            &format!("「{title}」已生效，会显示在帖子与评论的作者名后面。"),
            "/me",
        )
        .await;
    } else {
        let note = input.note.trim();
        let body = if note.is_empty() {
            format!("「{title}」这次没有通过，可以改个说法再申请。")
        } else {
            format!("「{title}」这次没有通过：{note}")
        };
        let _ =
            crate::notifications::push(pool, &user_id, "title", "头衔申请未通过", &body, "/me")
                .await;
    }
    Ok(true)
}
