//! 用户仓库：注册校验、创建（首个用户成为管理员）、密码登录、头衔。
//!
//! 与 Node 版的差异只在存储——语义必须一致，尤其是：
//! * 用户名统一转小写后再落库；
//! * 「首个用户成为管理员」必须在**同一事务 + advisory lock** 内判定，并发只出一个 admin；
//! * 登录失败不区分「无此用户」与「密码错」，且用户不存在时也走一次哈希，避免时间侧信道。

use chrono::{DateTime, Utc};
use rand::RngCore;
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;

use crate::auth::password;

pub const TITLE_MIN: usize = 2;
pub const TITLE_MAX: usize = 8;
pub const ADMIN_LABEL: &str = "管理员";

/// 普通用户不能用的头衔，避免冒充站务
pub const RESERVED_TITLES: [&str; 10] = [
    "管理员",
    "管理",
    "站务",
    "站长",
    "官方",
    "版主",
    "超管",
    "仲裁",
    "客服",
    "系统",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    Member,
}

impl Role {
    pub fn from_db(raw: &str) -> Self {
        if raw == "admin" {
            Role::Admin
        } else {
            Role::Member
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::Member => "member",
        }
    }
    pub fn is_admin(self) -> bool {
        matches!(self, Role::Admin)
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: String,
    pub username: String,
    pub nickname: String,
    pub password_hash: String,
    pub email: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub banned: bool,
    pub title: Option<String>,
    pub badges: Value,
    pub notif_read_at: Option<DateTime<Utc>>,
}

const COLUMNS: &str = "id, username, nickname, password_hash, email, role, created_at, banned, title, badges, notif_read_at";

/// 对外暴露的用户信息（不含哈希）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicUser {
    pub id: String,
    pub username: String,
    pub nickname: String,
    pub role: Role,
    pub is_admin: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notif_read_at: Option<i64>,
    #[serde(skip_serializing_if = "is_false")]
    pub banned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub providers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badges: Option<Vec<String>>,
}

fn is_false(v: &bool) -> bool {
    !*v
}

impl UserRow {
    pub fn to_public(&self) -> PublicUser {
        let role = Role::from_db(&self.role);
        let badges = self.badges.as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        });

        PublicUser {
            id: self.id.clone(),
            username: self.username.clone(),
            nickname: self.nickname.clone(),
            role,
            is_admin: role.is_admin(),
            created_at: self.created_at.timestamp_millis(),
            notif_read_at: self.notif_read_at.map(|t| t.timestamp_millis()),
            banned: self.banned,
            title: self.title.clone(),
            email: self.email.clone(),
            providers: None,
            badges: badges.filter(|b| !b.is_empty()),
        }
    }
}

/* ── 校验 ───────────────────────────────── */

pub struct RegisterInput {
    pub username: String,
    pub nickname: String,
    pub password: String,
    pub email: String,
}

/// 返回中文错误文案；合法返回 `None`（文案与 Node 版逐字一致）
pub fn validate_register(input: &RegisterInput) -> Option<&'static str> {
    let username = input.username.trim();
    let nickname = input.nickname.trim();
    let password = &input.password;

    if !valid_username(username) {
        return Some("用户名需 3–20 位，仅限字母、数字、下划线、短横线");
    }
    let nick_len = nickname.chars().count();
    if !(2..=16).contains(&nick_len) {
        return Some("昵称需 2–16 字");
    }
    let pw_len = password.chars().count();
    if !(8..=64).contains(&pw_len) {
        return Some("密码需 8–64 位");
    }
    let email = input.email.trim();
    if !email.is_empty() && !is_email(email) {
        return Some("邮箱格式不正确");
    }
    if !password.chars().any(|c| c.is_ascii_alphabetic())
        || !password.chars().any(|c| c.is_ascii_digit())
    {
        return Some("密码需同时包含字母和数字");
    }
    None
}

pub fn valid_username(v: &str) -> bool {
    let len = v.chars().count();
    (3..=20).contains(&len)
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn is_email(v: &str) -> bool {
    let t = v.trim();
    if t.contains(char::is_whitespace) {
        return false;
    }
    let mut parts = t.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    match domain.rsplit_once('.') {
        Some((_, tld)) => tld.chars().count() >= 2 && !tld.is_empty(),
        None => false,
    }
}

pub fn normalize_email(v: &str) -> Option<String> {
    let t = v.trim().to_lowercase();
    if t.is_empty() || !is_email(&t) {
        None
    } else {
        Some(t)
    }
}

/// 头衔校验：空串表示清除；保留字只对非管理员拦截
pub fn normalize_title(raw: &str, is_admin: bool) -> Result<String, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Ok(String::new());
    }

    // 去掉控制字符与换行，避免撑破单行布局；连续空白压成一个
    let mut clean = String::with_capacity(text.len());
    let mut last_space = false;
    for c in text.chars() {
        if c.is_control() || c.is_whitespace() {
            if !last_space {
                clean.push(' ');
                last_space = true;
            }
        } else {
            clean.push(c);
            last_space = false;
        }
    }
    let clean = clean.trim().to_string();

    let len = clean.chars().count();
    if !(TITLE_MIN..=TITLE_MAX).contains(&len) {
        return Err(format!("头衔需 {TITLE_MIN}–{TITLE_MAX} 个字"));
    }

    if !is_admin {
        if let Some(hit) = RESERVED_TITLES.iter().find(|t| clean.contains(**t)) {
            return Err(format!("「{hit}」是保留头衔，不能使用"));
        }
    }

    Ok(clean)
}

/* ── 读取 ───────────────────────────────── */

pub async fn count(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(pool)
        .await
}

pub async fn find_by_id(pool: &PgPool, id: &str) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(&format!("SELECT {COLUMNS} FROM users WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn find_by_username(
    pool: &PgPool,
    username: &str,
) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(&format!(
        "SELECT {COLUMNS} FROM users WHERE lower(username) = lower($1)"
    ))
    .bind(username.trim())
    .fetch_optional(pool)
    .await
}

pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<UserRow>, sqlx::Error> {
    let Some(target) = normalize_email(email) else {
        return Ok(None);
    };
    sqlx::query_as::<_, UserRow>(&format!(
        "SELECT {COLUMNS} FROM users WHERE lower(email) = lower($1)"
    ))
    .bind(target)
    .fetch_optional(pool)
    .await
}

pub async fn list(pool: &PgPool) -> Result<Vec<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(&format!(
        "SELECT {COLUMNS} FROM users ORDER BY created_at ASC"
    ))
    .fetch_all(pool)
    .await
}

/// 可用管理员数量（`role=admin && !banned`）——后台防锁死规则要反复用它
pub async fn count_admins(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*) FROM users WHERE role = 'admin' AND NOT banned")
        .fetch_one(pool)
        .await
}

/* ── 写入 ───────────────────────────────── */

pub enum CreateError {
    Invalid(&'static str),
    UsernameTaken,
    EmailTaken,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for CreateError {
    fn from(e: sqlx::Error) -> Self {
        CreateError::Db(e)
    }
}

fn constraint(e: &sqlx::Error) -> Option<&str> {
    e.as_database_error().and_then(|d| d.constraint())
}

/// 创建用户。角色在**同一事务 + advisory lock** 内判定，并发也只出一个 admin。
pub async fn create(
    pool: &PgPool,
    input: &RegisterInput,
) -> Result<(PublicUser, bool), CreateError> {
    if let Some(msg) = validate_register(input) {
        return Err(CreateError::Invalid(msg));
    }

    let username = input.username.trim().to_lowercase();
    let nickname = input.nickname.trim().to_string();
    let email = normalize_email(&input.email);

    let pw = input.password.clone();
    let hash = tokio::task::spawn_blocking(move || password::hash_password(&pw))
        .await
        .map_err(|e| CreateError::Db(sqlx::Error::Protocol(e.to_string())))?
        .map_err(|e| CreateError::Db(sqlx::Error::Protocol(e.to_string())))?;

    let mut tx = pool.begin().await?;

    // 先取锁再数数：两个并发注册会串行化，第二个看到的 count 已经变成 1
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('arena:first-user'))")
        .execute(&mut *tx)
        .await?;

    let taken: Option<String> =
        sqlx::query_scalar("SELECT id FROM users WHERE lower(username) = lower($1)")
            .bind(&username)
            .fetch_optional(&mut *tx)
            .await?;
    if taken.is_some() {
        return Err(CreateError::UsernameTaken);
    }

    if let Some(mail) = &email {
        let taken: Option<String> =
            sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1)")
                .bind(mail)
                .fetch_optional(&mut *tx)
                .await?;
        if taken.is_some() {
            return Err(CreateError::EmailTaken);
        }
    }

    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&mut *tx)
        .await?;
    let became_admin = total == 0;
    let id = new_id();

    let inserted = sqlx::query(
        "INSERT INTO users (id, username, nickname, password_hash, email, role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())",
    )
    .bind(&id)
    .bind(&username)
    .bind(&nickname)
    .bind(&hash)
    .bind(&email)
    .bind(if became_admin { "admin" } else { "member" })
    .execute(&mut *tx)
    .await;

    if let Err(e) = inserted {
        return match constraint(&e) {
            Some("users_username_lower") => Err(CreateError::UsernameTaken),
            Some("users_email_lower") => Err(CreateError::EmailTaken),
            _ => Err(CreateError::Db(e)),
        };
    }

    tx.commit().await?;

    let row = find_by_id(pool, &id)
        .await?
        .ok_or_else(|| CreateError::Db(sqlx::Error::RowNotFound))?;
    Ok((row.to_public(), became_admin))
}

/// 密码登录。带 `@` 当邮箱处理，否则先查用户名再兜底邮箱。
pub async fn authenticate(pool: &PgPool, identifier: &str, password: &str) -> Option<PublicUser> {
    let text = identifier.trim();
    let row = if text.contains('@') {
        find_by_email(pool, text).await.ok().flatten()
    } else {
        match find_by_username(pool, text).await.ok().flatten() {
            Some(u) => Some(u),
            None => find_by_email(pool, text).await.ok().flatten(),
        }
    };

    let Some(row) = row else {
        // 用户不存在也走一次哈希，避免用响应时间探测账号是否存在
        let pw = password.to_string();
        let _ = tokio::task::spawn_blocking(move || password::hash_password(&pw)).await;
        return None;
    };

    // 纯第三方账号没有密码，禁止密码登录
    if row.password_hash.is_empty() {
        return None;
    }

    let stored = row.password_hash.clone();
    let pw = password.to_string();
    let ok = tokio::task::spawn_blocking(move || password::verify_password(&pw, &stored))
        .await
        .unwrap_or(false);
    if !ok {
        return None;
    }

    let _ = sqlx::query("UPDATE users SET last_login_at = now() WHERE id = $1")
        .bind(&row.id)
        .execute(pool)
        .await;

    Some(row.to_public())
}

/// 改头衔。`None` 表示清除（回落角色默认文案）。
pub async fn set_title(
    pool: &PgPool,
    id: &str,
    title: Option<&str>,
) -> Result<Option<PublicUser>, sqlx::Error> {
    let clean = title.map(str::trim).filter(|t| !t.is_empty());
    let updated = sqlx::query_as::<_, UserRow>(&format!(
        "UPDATE users SET title = $2 WHERE id = $1 RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(clean)
    .fetch_optional(pool)
    .await?;
    Ok(updated.map(|r| r.to_public()))
}

/// 推进站内信已读水位（只往后，不回退），返回新的水位毫秒
pub async fn mark_notifications_read(pool: &PgPool, id: &str) -> Result<i64, sqlx::Error> {
    let now = Utc::now();
    let next: Option<DateTime<Utc>> = sqlx::query_scalar(
        "UPDATE users SET notif_read_at = GREATEST(COALESCE(notif_read_at, to_timestamp(0)), $2)
         WHERE id = $1 RETURNING notif_read_at",
    )
    .bind(id)
    .bind(now)
    .fetch_optional(pool)
    .await?;
    Ok(next.unwrap_or(now).timestamp_millis())
}

/// `u` + base36 毫秒时间戳 + 4 位随机 base36（与 Node 版同构，长度不固定）
fn new_id() -> String {
    const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut n = Utc::now().timestamp_millis().max(0) as u64;
    let mut ts = Vec::new();
    while n > 0 {
        ts.push(ALPHABET[(n % 36) as usize]);
        n /= 36;
    }
    if ts.is_empty() {
        ts.push(b'0');
    }
    ts.reverse();

    let mut rnd = [0u8; 4];
    rand::rng().fill_bytes(&mut rnd);

    let mut out = String::with_capacity(1 + ts.len() + 4);
    out.push('u');
    for b in ts {
        out.push(b as char);
    }
    for b in rnd {
        out.push(ALPHABET[(b % 36) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_rules() {
        assert!(valid_username("abc"));
        assert!(valid_username("a_b-c9"));
        assert!(!valid_username("ab"));
        assert!(!valid_username("abc def"));
        assert!(!valid_username(&"a".repeat(21)));
    }

    #[test]
    fn email_rules() {
        assert!(is_email("a@b.co"));
        assert!(!is_email("a@b"));
        assert!(!is_email("a b@c.de"));
        assert!(!is_email("a@@b.co"));
        assert_eq!(normalize_email("  A@B.CO "), Some("a@b.co".to_string()));
        assert_eq!(normalize_email("nope"), None);
    }

    #[test]
    fn title_rules() {
        assert_eq!(normalize_title("", false), Ok(String::new()));
        assert_eq!(normalize_title(" 服主 ", false), Ok("服主".to_string()));
        assert!(normalize_title("管", false).is_err());
        assert!(normalize_title("一二三四五六七八九", false).is_err());
        assert!(normalize_title("管理员", false).is_err());
        // 管理员可以用保留字
        assert_eq!(normalize_title("管理员", true), Ok("管理员".to_string()));
        // 控制字符会被压成空格，不会带进数据库
        assert_eq!(normalize_title("服\n主", false), Ok("服 主".to_string()));
    }

    #[test]
    fn ids_look_like_node() {
        let id = new_id();
        assert!(id.starts_with('u'));
        assert!(id.len() >= 6);
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_ne!(id, new_id());
    }
}
