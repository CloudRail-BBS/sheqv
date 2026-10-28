//! 蓝标 / 红标认证：用户提交 → 管理员审核 → 通过才写到 `users.verify_kind`。
//!
//! 和头衔的区别：头衔只是一段展示文案，认证是**平台给身份背书**，
//! 所以既不能自设、也不能像头衔那样换个样式玩；只有 `blue`（个人）与 `red`（机构）两种，
//! 通过后名字后面固定挂一枚印记，鼠标悬停能看到认证说明。
//!
//! 管理员也可以跳过申请直接授予（`set_direct`）：官方账号、合作方账号通常不会自己来提申请。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

/// 两种认证。键与 CSS 的 `.vmark[data-vk="…"]` 对应。
pub const KINDS: [&str; 2] = ["blue", "red"];
pub const STATUSES: [&str; 4] = ["pending", "approved", "rejected", "cancelled"];

/// 主体名称：短一点，太长的「机构全称」在名字后面挂不住
pub const SUBJECT_MIN: usize = 2;
pub const SUBJECT_MAX: usize = 40;
pub const LABEL_MAX: usize = 20;
pub const EVIDENCE_MIN: usize = 10;
pub const EVIDENCE_MAX: usize = 500;

pub fn valid_kind(v: &str) -> bool {
    KINDS.contains(&v)
}

pub fn kind_label(v: &str) -> &'static str {
    match v {
        "blue" => "蓝标认证",
        "red" => "红标认证",
        _ => "认证",
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestView {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub avatar: String,
    pub kind: String,
    pub subject: String,
    pub category: String,
    pub evidence: String,
    pub contact: String,
    /// 通过时管理员确认的对外说明
    pub label: String,
    pub status: String,
    pub review_note: String,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<i64>,
    /// 申请人当前已生效的认证（可能和这次申请的不同，比如蓝标升红标）
    #[serde(skip_serializing_if = "String::is_empty")]
    pub current_kind: String,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    user_id: String,
    nickname: String,
    avatar: String,
    kind: String,
    subject: String,
    category: String,
    evidence: String,
    contact: String,
    label: String,
    status: String,
    review_note: String,
    created_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
    current_kind: String,
}

impl Row {
    fn into_view(self) -> RequestView {
        RequestView {
            id: self.id,
            user_id: self.user_id,
            nickname: self.nickname,
            avatar: self.avatar,
            kind: self.kind,
            subject: self.subject,
            category: self.category,
            evidence: self.evidence,
            contact: self.contact,
            label: self.label,
            status: self.status,
            review_note: self.review_note,
            created_at: self.created_at.timestamp_millis(),
            reviewed_at: self.reviewed_at.map(|t| t.timestamp_millis()),
            current_kind: self.current_kind,
        }
    }
}

const COLS: &str = "r.id, r.user_id, u.nickname, u.avatar, r.kind, r.subject, r.category,
        r.evidence, r.contact, r.label, r.status, r.review_note, r.created_at, r.reviewed_at,
        u.verify_kind AS current_kind";

pub enum VerifyError {
    NotFound,
    AlreadyPending,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for VerifyError {
    fn from(e: sqlx::Error) -> Self {
        VerifyError::Db(e)
    }
}

/// 本人的申请记录（新的在前，最多 10 条）
pub async fn list_mine(pool: &PgPool, user_id: &str) -> Result<Vec<RequestView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM verification_requests r JOIN users u ON u.id = r.user_id
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
        "SELECT {COLS} FROM verification_requests r JOIN users u ON u.id = r.user_id
          WHERE ($1 = '' OR r.status = $1)
          ORDER BY (r.status = 'pending') DESC, r.created_at DESC
          LIMIT 200"
    ))
    .bind(status)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

pub struct NewRequest<'a> {
    pub kind: &'a str,
    pub subject: &'a str,
    pub category: &'a str,
    pub evidence: &'a str,
    pub contact: &'a str,
}

pub async fn create(
    pool: &PgPool,
    user_id: &str,
    input: &NewRequest<'_>,
) -> Result<RequestView, VerifyError> {
    if !valid_kind(input.kind) {
        return Err(VerifyError::Invalid("认证类型不合法".into()));
    }
    let subject = input.subject.trim();
    let len = subject.chars().count();
    if len < SUBJECT_MIN {
        return Err(VerifyError::Invalid("请填写认证主体名称".into()));
    }
    if len > SUBJECT_MAX {
        return Err(VerifyError::Invalid(format!("认证主体名称不能超过 {SUBJECT_MAX} 字")));
    }
    let evidence = input.evidence.trim();
    let ev_len = evidence.chars().count();
    if ev_len < EVIDENCE_MIN {
        return Err(VerifyError::Invalid("证明材料至少写 10 个字，附上链接更好".into()));
    }
    if ev_len > EVIDENCE_MAX {
        return Err(VerifyError::Invalid("证明材料不能超过 500 字".into()));
    }
    if input.category.chars().count() > 20 || input.contact.chars().count() > 60 {
        return Err(VerifyError::Invalid("类别或联系方式过长".into()));
    }

    let pending: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM verification_requests WHERE user_id = $1 AND status = 'pending'",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if pending.is_some() {
        return Err(VerifyError::AlreadyPending);
    }

    let row: Row = sqlx::query_as(&format!(
        "WITH ins AS (
             INSERT INTO verification_requests
                 (id, user_id, kind, subject, category, evidence, contact)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *
         )
         SELECT {COLS} FROM ins r JOIN users u ON u.id = r.user_id"
    ))
    .bind(crate::ids::next('v'))
    .bind(user_id)
    .bind(input.kind)
    .bind(subject)
    .bind(input.category.trim())
    .bind(evidence)
    .bind(input.contact.trim())
    .fetch_one(pool)
    .await?;
    Ok(row.into_view())
}

/// 撤销自己待审的申请
pub async fn cancel(pool: &PgPool, user_id: &str, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE verification_requests SET status = 'cancelled'
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
    /// 审核时可以改类型（比如把蓝标申请按红标批）与对外说明
    pub kind: Option<&'a str>,
    pub label: Option<&'a str>,
    pub note: &'a str,
    pub reviewer: Option<&'a str>,
}

/// 审核。通过时把最终类型与说明写进 `users`，被拒只留记录。
pub async fn review(pool: &PgPool, id: &str, input: &Review<'_>) -> Result<bool, VerifyError> {
    if !STATUSES.contains(&input.status) {
        return Err(VerifyError::Invalid("状态不合法".into()));
    }
    if input.status != "approved" && input.status != "rejected" {
        return Err(VerifyError::Invalid("只能通过或拒绝".into()));
    }

    let row: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT user_id, kind, subject, label FROM verification_requests WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    let Some((user_id, cur_kind, subject, cur_label)) = row else {
        return Err(VerifyError::NotFound);
    };

    let kind: &str = match input.kind {
        Some(k) if valid_kind(k) => k,
        _ => &cur_kind,
    };
    // 管理员没填说明时，优先沿用上一次的，再退回申请主体
    let raw_label: String = match input.label.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => s.to_string(),
        None if cur_label.trim().is_empty() => subject.clone(),
        None => cur_label.clone(),
    };
    let label: String = raw_label.chars().take(LABEL_MAX).collect();

    let done = sqlx::query(
        "UPDATE verification_requests
            SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
                kind = $5, label = $6
          WHERE id = $1 AND status = 'pending'",
    )
    .bind(id)
    .bind(input.status)
    .bind(input.note.trim())
    .bind(input.reviewer)
    .bind(kind)
    .bind(&label)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Err(VerifyError::Invalid("这条申请已经处理过了".into()));
    }

    if input.status == "approved" {
        sqlx::query(
            "UPDATE users
                SET verify_kind = $2, verify_label = $3,
                    verified_at = COALESCE(verified_at, now())
              WHERE id = $1",
        )
        .bind(&user_id)
        .bind(kind)
        .bind(&label)
        .execute(pool)
        .await?;

        let _ = crate::notifications::push(
            pool,
            &user_id,
            "verify",
            &format!("{}已通过", kind_label(kind)),
            &format!("「{label}」已生效，会显示在你的名字后面；鼠标悬停可以看到认证说明。"),
            "/me",
        )
        .await;
    } else {
        let note = input.note.trim();
        let body = if note.is_empty() {
            format!("这次「{}」没有通过，可以补充材料后重新申请。", subject)
        } else {
            format!("这次「{}」没有通过：{note}", subject)
        };
        let _ = crate::notifications::push(
            pool,
            &user_id,
            "verify",
            &format!("{}未通过", kind_label(&cur_kind)),
            &body,
            "/me",
        )
        .await;
    }
    Ok(true)
}

/// 后台直接授予 / 取消认证（不走申请流程）。
///
/// `kind` 传空串表示取消；`label` 会按 [`LABEL_MAX`] 截断。
pub async fn set_direct(
    pool: &PgPool,
    user_id: &str,
    kind: &str,
    label: &str,
) -> Result<bool, sqlx::Error> {
    let clean = if valid_kind(kind) { kind } else { "" };
    let label: String = if clean.is_empty() {
        String::new()
    } else {
        label.trim().chars().take(LABEL_MAX).collect()
    };
    let done = sqlx::query(
        "UPDATE users
            SET verify_kind = $2, verify_label = $3,
                verified_at = CASE WHEN $2 = '' THEN NULL ELSE COALESCE(verified_at, now()) END
          WHERE id = $1",
    )
    .bind(user_id)
    .bind(clean)
    .bind(&label)
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}
