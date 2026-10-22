//! 跨语言兼容性测试。
//!
//! 这里的常量是**用现有 Node 实现真实生成**的产物（2026-10-22），
//! 不是手算的。Rust 侧必须能验通过、且能生成完全相同的字符串。
//! 这些用例不过，就不许切换后端 —— 否则线上会集体掉线。

use arena_api::auth::{password, session};

/// Node: scryptSync('test1234', salt 00..0f, 64, { N: 16384, r: 8, p: 1 })
/// 然后用 `scrypt$N$r$p$salt$hash` 拼接，salt/key 为**标准 base64**。
const NODE_HASH: &str = "scrypt$16384$8$1$AAECAwQFBgcICQoLDA0ODw==$jSF8nh/KpCt5FAOHJS3SzK/Ya0H/bqDc5gUXkz+wIoTytol5m97XdVJri7IuMKmrtAxJhymZ9uEdiUHU8XLJBA==";

/// Node: createHmac('sha256', 'compat-test-secret')
///   .update('utest123.1793000000').digest('base64url')
const NODE_TOKEN: &str = "utest123.1793000000.Z2febZApgi5kMnCnYiZSROhTmRx1IWvH3gVD054sMt4";
const NODE_SECRET: &str = "compat-test-secret";
const NODE_USER_ID: &str = "utest123";
const NODE_EXP: i64 = 1_793_000_000;

#[test]
fn verifies_password_hash_created_by_node() {
    assert!(password::verify_password("test1234", NODE_HASH));
    assert!(!password::verify_password("test12345", NODE_HASH));
    assert!(!password::verify_password("", NODE_HASH));
}

#[test]
fn verifies_session_token_created_by_node() {
    // 未过期
    let uid = session::verify_token(NODE_SECRET.as_bytes(), NODE_TOKEN, NODE_EXP - 60);
    assert_eq!(uid.as_deref(), Some(NODE_USER_ID));

    // 过期一秒就失效
    let expired = session::verify_token(NODE_SECRET.as_bytes(), NODE_TOKEN, NODE_EXP + 1);
    assert!(expired.is_none());

    // 换密钥就失效
    let wrong = session::verify_token(b"other-secret", NODE_TOKEN, NODE_EXP - 60);
    assert!(wrong.is_none());
}

#[test]
fn issues_byte_identical_session_token() {
    // issue_token 的 exp = now + TTL，反推出签发时间，应当得到与 Node 完全相同的串
    let issued_at = NODE_EXP - session::SESSION_TTL_SECS;
    let token = session::issue_token(NODE_SECRET.as_bytes(), NODE_USER_ID, issued_at);
    assert_eq!(token, NODE_TOKEN);
}

#[test]
fn produces_same_hash_for_same_salt() {
    // 同一密码 + 同一盐 → 必须逐字节相同，证明确实是同一套参数
    let salt: [u8; 16] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    let hash = password::hash_with_salt("test1234", &salt).expect("哈希失败");
    assert_eq!(hash, NODE_HASH);
}
