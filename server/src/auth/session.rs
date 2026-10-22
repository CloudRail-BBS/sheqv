//! 无状态签名会话：`ba_session = <userId>.<exp 秒>.<base64url(HMAC-SHA256)>`。
//!
//! 与 Node 版一致的三点，任何一条改动都会让已发出的 Cookie 全部失效：
//! 1. 签名对象是拼接后的文本 `"{userId}.{exp}"`，不是解码后的字节；
//! 2. 结果是 **URL-safe 无填充** base64（Node 的 `digest('base64url')`）；
//! 3. 过期判断用秒级时间戳，`exp < now` 即失效。

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

pub const SESSION_COOKIE: &str = "ba_session";
pub const SESSION_TTL_SECS: i64 = 7 * 24 * 60 * 60;

type HmacSha256 = Hmac<Sha256>;

fn sign(secret: &[u8], data: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC 接受任意长度密钥");
    mac.update(data.as_bytes());
    B64URL.encode(mac.finalize().into_bytes())
}

/// 签发 token。`now_secs` 显式传入，便于测试与回放。
pub fn issue_token(secret: &[u8], user_id: &str, now_secs: i64) -> String {
    let exp = now_secs + SESSION_TTL_SECS;
    let data = format!("{user_id}.{exp}");
    let sig = sign(secret, &data);
    format!("{data}.{sig}")
}

/// 校验 token，成功返回 `userId`。
pub fn verify_token(secret: &[u8], token: &str, now_secs: i64) -> Option<String> {
    let mut parts = token.split('.');
    let user_id = parts.next()?;
    let exp_str = parts.next()?;
    let sig = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    if user_id.is_empty() {
        return None;
    }

    let exp: i64 = exp_str.parse().ok()?;
    if exp < now_secs {
        return None;
    }

    let expected = sign(secret, &format!("{user_id}.{exp_str}"));
    if sig.as_bytes().ct_eq(expected.as_bytes()).into() {
        Some(user_id.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"unit-secret";

    #[test]
    fn issue_and_verify() {
        let token = issue_token(SECRET, "utest123", 1_700_000_000);
        assert_eq!(
            verify_token(SECRET, &token, 1_700_000_001).as_deref(),
            Some("utest123")
        );
    }

    #[test]
    fn rejects_expired_wrong_secret_and_malformed() {
        let token = issue_token(SECRET, "utest123", 1_700_000_000);
        let after = 1_700_000_000 + SESSION_TTL_SECS + 1;

        assert!(verify_token(SECRET, &token, after).is_none(), "过期应拒绝");
        assert!(
            verify_token(b"other", &token, 1_700_000_001).is_none(),
            "换密钥应拒绝"
        );
        assert!(
            verify_token(SECRET, "a.b", 1_700_000_001).is_none(),
            "少一段应拒绝"
        );
        assert!(
            verify_token(SECRET, "a.b.c.d", 1_700_000_001).is_none(),
            "多一段应拒绝"
        );
        assert!(
            verify_token(SECRET, "", 1_700_000_001).is_none(),
            "空串应拒绝"
        );

        let mut tampered = token.clone();
        tampered.push('x');
        assert!(
            verify_token(SECRET, &tampered, 1_700_000_001).is_none(),
            "被改动应拒绝"
        );
    }
}
