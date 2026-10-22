//! 密码哈希：scrypt，格式 `scrypt$N$r$p$<base64 盐>$<base64 key>`。
//!
//! 与 Node 版的三个必须一致的点：
//! 1. 参数 `N=16384, r=8, p=1`，key 长度 64，盐 16 字节；
//! 2. 盐与 key 用**标准 base64**（带 `=` 填充），不是 URL-safe；
//! 3. 校验时从哈希串里读 N/r/p，允许老用户停留在旧强度上逐次升级。

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use rand::RngCore;
use scrypt::{Params, scrypt};
use subtle::ConstantTimeEq;

/// `N = 2^14 = 16384`
pub const LOG_N: u8 = 14;
pub const R: u32 = 8;
pub const P: u32 = 1;
pub const KEY_LEN: usize = 64;
pub const SALT_LEN: usize = 16;

#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("scrypt 参数非法")]
    InvalidParams,
    #[error("scrypt 派生失败")]
    Derive,
}

/// 生成新哈希（随机盐）。
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    let mut salt = [0u8; SALT_LEN];
    rand::rng().fill_bytes(&mut salt);
    hash_with_salt(password, &salt)
}

/// 用指定盐生成哈希。测试与数据迁移用得到。
pub fn hash_with_salt(password: &str, salt: &[u8]) -> Result<String, PasswordError> {
    let params = Params::new(LOG_N, R, P).map_err(|_| PasswordError::InvalidParams)?;
    let mut key = [0u8; KEY_LEN];
    scrypt(password.as_bytes(), salt, &params, &mut key).map_err(|_| PasswordError::Derive)?;

    let n = 1u64 << LOG_N;
    Ok(format!(
        "scrypt${n}${R}${P}${salt}${key}",
        salt = B64.encode(salt),
        key = B64.encode(key),
    ))
}

/// 校验密码。任何格式问题都返回 `false`，不区分「格式错」与「密码错」。
pub fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();
    if parts.len() != 6 || parts[0] != "scrypt" {
        return false;
    }

    let (Ok(n), Ok(r), Ok(p)) = (
        parts[1].parse::<u64>(),
        parts[2].parse::<u32>(),
        parts[3].parse::<u32>(),
    ) else {
        return false;
    };
    // N 必须是 2 的幂；scrypt 的 Params 只接受 log2(N)
    if n < 2 || !n.is_power_of_two() {
        return false;
    }
    let log_n = n.trailing_zeros() as u8;

    let (Ok(salt), Ok(expected)) = (B64.decode(parts[4]), B64.decode(parts[5])) else {
        return false;
    };
    if expected.is_empty() || salt.is_empty() {
        return false;
    }

    let Ok(params) = Params::new(log_n, r, p) else {
        return false;
    };
    let mut key = vec![0u8; expected.len()];
    if scrypt(password.as_bytes(), &salt, &params, &mut key).is_err() {
        return false;
    }

    key.ct_eq(&expected).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let stored = hash_password("test1234").expect("哈希失败");
        assert!(verify_password("test1234", &stored));
        assert!(!verify_password("test12345", &stored));
    }

    #[test]
    fn malformed_is_false() {
        assert!(!verify_password("x", ""));
        assert!(!verify_password("x", "scrypt$16384$8$1$onlyfive"));
        assert!(!verify_password("x", "bcrypt$16384$8$1$AA==$AA=="));
        assert!(!verify_password("x", "scrypt$12345$8$1$AA==$AA=="));
    }

    #[test]
    fn params_are_read_from_hash() {
        // 用一组更弱的参数生成，校验仍应通过——证明没有写死强度
        let params = Params::new(10, 8, 1).unwrap();
        let salt = [7u8; 16];
        let mut key = [0u8; 32];
        scrypt(b"pw", &salt, &params, &mut key).unwrap();
        let stored = format!("scrypt$1024$8$1${}${}", B64.encode(salt), B64.encode(key));
        assert!(verify_password("pw", &stored));
    }
}
