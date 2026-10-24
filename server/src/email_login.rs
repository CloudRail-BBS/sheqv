//! 邮箱验证码登录：发码、限流、校验。
//!
//! 三个安全约束（都别省）：
//! 1. **验证码只存 HMAC 哈希**，密钥是 SESSION_SECRET（不落库）。
//! 2. **限流**：同邮箱 60 秒一次、每小时 5 次；一条记录输错 5 次即作废。
//! 3. **不暴露邮箱是否注册**：账号不存在时也返回「已发送」，只是不发信。

use base64::Engine as _;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;
use sqlx::PgPool;
use subtle::ConstantTimeEq;

use crate::ids;

pub const CODE_TTL_MINUTES: i32 = 10;
pub const RESEND_SECONDS: i64 = 60;
pub const MAX_PER_HOUR: i64 = 5;
pub const MAX_ATTEMPTS: i32 = 5;

/// `HMAC-SHA256(secret, "邮箱小写:验证码")` → base64url（无填充）
pub fn hash_code(secret: &[u8], email: &str, code: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC 接受任意长度密钥");
    mac.update(format!("{}:{}", email.trim().to_lowercase(), code).as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

/// 6 位数字，补前导零
pub fn gen_code() -> String {
    let n: u32 = rand::rng().random_range(0..1_000_000);
    format!("{n:06}")
}

pub enum Throttle {
    Ok,
    TooSoon(i64),
    TooMany,
}

/// 同一邮箱 60 秒一次、每小时最多 5 次
pub async fn check_throttle(pool: &PgPool, email: &str) -> Result<Throttle, sqlx::Error> {
    let (last, hour_count): (Option<DateTime<Utc>>, i64) = sqlx::query_as(
        "SELECT max(created_at),
                count(*) FILTER (WHERE created_at > now() - interval '1 hour')
           FROM email_codes
          WHERE lower(email) = lower($1)",
    )
    .bind(email)
    .fetch_one(pool)
    .await?;

    if let Some(t) = last {
        let elapsed = (Utc::now() - t).num_seconds();
        if elapsed < RESEND_SECONDS {
            return Ok(Throttle::TooSoon(RESEND_SECONDS - elapsed));
        }
    }
    if hour_count >= MAX_PER_HOUR {
        return Ok(Throttle::TooMany);
    }
    Ok(Throttle::Ok)
}

/// 写入一条验证码记录，返回记录 id（发信失败时用它回滚）
pub async fn issue(
    pool: &PgPool,
    email: &str,
    code_hash: &str,
    ip: Option<&str>,
) -> Result<String, sqlx::Error> {
    // 顺手清理过期一天的记录：低频、无副作用，省得再单起定时任务
    let _ = sqlx::query("DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'")
        .execute(pool)
        .await;

    let id = ids::next('v');
    sqlx::query(
        "INSERT INTO email_codes (id, email, code_hash, expires_at, ip)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5)",
    )
    .bind(&id)
    .bind(email)
    .bind(code_hash)
    .bind(CODE_TTL_MINUTES)
    .bind(ip)
    .execute(pool)
    .await?;
    Ok(id)
}

/// 发信失败时把刚写的记录删掉，避免留下一条用户永远收不到的验证码
pub async fn discard(pool: &PgPool, id: &str) {
    let _ = sqlx::query("DELETE FROM email_codes WHERE id = $1 AND consumed_at IS NULL")
        .bind(id)
        .execute(pool)
        .await;
}

pub enum Verify {
    Ok,
    /// 没有可用记录（没发过 / 已用过 / 已过期）
    NoCode,
    /// 这条记录错太多次，已作废
    TooManyAttempts,
    Wrong,
}

/// 校验验证码。成功即消费掉这条记录（一次性）。
pub async fn verify(
    pool: &PgPool,
    secret: &[u8],
    email: &str,
    code: &str,
) -> Result<Verify, sqlx::Error> {
    let row: Option<(String, String, i32)> = sqlx::query_as(
        "SELECT id, code_hash, attempts
           FROM email_codes
          WHERE lower(email) = lower($1)
            AND consumed_at IS NULL
            AND expires_at > now()
          ORDER BY created_at DESC
          LIMIT 1",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    let Some((id, stored, attempts)) = row else {
        return Ok(Verify::NoCode);
    };
    if attempts >= MAX_ATTEMPTS {
        return Ok(Verify::TooManyAttempts);
    }

    let expect = hash_code(secret, email, code);
    if expect.as_bytes().ct_eq(stored.as_bytes()).into() {
        sqlx::query("UPDATE email_codes SET consumed_at = now() WHERE id = $1")
            .bind(&id)
            .execute(pool)
            .await?;
        Ok(Verify::Ok)
    } else {
        sqlx::query("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1")
            .bind(&id)
            .execute(pool)
            .await?;
        Ok(Verify::Wrong)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_is_six_digits() {
        for _ in 0..50 {
            let c = gen_code();
            assert_eq!(c.len(), 6);
            assert!(c.chars().all(|ch| ch.is_ascii_digit()));
        }
    }

    #[test]
    fn hash_is_stable_and_email_case_insensitive() {
        let a = hash_code(b"secret", "A@Example.com", "123456");
        let b = hash_code(b"secret", "a@example.com ", "123456");
        assert_eq!(a, b);
        assert_ne!(a, hash_code(b"secret", "a@example.com", "123457"));
        assert_ne!(a, hash_code(b"other", "a@example.com", "123456"));
    }
}
