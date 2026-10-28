//! 浏览器推送（Web Push）。
//!
//! 协议两段：
//! 1. **VAPID**（RFC 8292）：用站点自己的 P-256 私钥签一个 ES256 JWT，
//!    放进 `Authorization: vapid t=…, k=…`，推送服务据此确认「谁在发」。
//! 2. **aes128gcm**（RFC 8291）：用订阅里的 `p256dh` 公钥与一次性 ECDH 密钥
//!    派生内容密钥，AES-128-GCM 加密正文。推送服务只转发密文。
//!
//! 密钥对在首次启动时生成并写进 settings（`vapidPublicKey` / `vapidPrivateKey`），
//! 换掉会导致所有已订阅设备失效，所以只生成一次。

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use anyhow::{Context, Result, anyhow};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use hkdf::Hkdf;
use p256::ecdsa::{Signature, SigningKey, signature::Signer};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::PgPool;

use crate::config::Config;
use crate::settings;

/// 单条推送的正文；字段名是前端 Service Worker 读取的约定
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PushPayload {
    pub title: String,
    #[serde(default)]
    pub body: String,
    /// 点击通知后打开的站内路径
    #[serde(default = "default_url")]
    pub url: String,
    /// 同类通知合并用（相同 tag 会覆盖旧通知）
    #[serde(default)]
    pub tag: String,
}

fn default_url() -> String {
    "/".to_string()
}

pub struct Keys {
    pub public_b64: String,
    pub private_b64: String,
    pub subject: String,
}

/// 读取（必要时生成）VAPID 密钥。只读一次 DB，调用方可以缓存。
pub async fn ensure_keys(pool: &PgPool, cfg: &Config) -> Result<Keys> {
    let s = settings::load(pool, cfg).await;
    let public_b64 = settings::text(&s, "vapidPublicKey");
    let private_b64 = settings::text(&s, "vapidPrivateKey");
    let subject = settings::text(&s, "vapidSubject");

    if !public_b64.is_empty() && !private_b64.is_empty() {
        return Ok(Keys {
            public_b64,
            private_b64,
            subject: if subject.is_empty() { "mailto:admin@localhost".into() } else { subject },
        });
    }

    let secret = SecretKey::random(&mut p256::elliptic_curve::rand_core::OsRng);
    let public = secret.public_key().to_encoded_point(false);
    let public_b64 = B64.encode(public.as_bytes());
    let private_b64 = B64.encode(secret.to_bytes());

    let mut patch = serde_json::Map::new();
    patch.insert("vapidPublicKey".into(), serde_json::json!(public_b64));
    patch.insert("vapidPrivateKey".into(), serde_json::json!(private_b64));
    if subject.is_empty() {
        patch.insert("vapidSubject".into(), serde_json::json!("mailto:admin@localhost"));
    }
    settings::update(pool, &patch, cfg)
        .await
        .map_err(|e| anyhow!("写入 VAPID 密钥失败：{e}"))?;

    Ok(Keys {
        public_b64,
        private_b64,
        subject: if subject.is_empty() { "mailto:admin@localhost".into() } else { subject },
    })
}

/// 一条订阅（从库里读出来的最小集合）
#[derive(Clone, Debug)]
pub struct Subscription {
    pub id: String,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// 发一条推送；返回是否成功。404/410 视为订阅已失效，调用方应删除。
pub async fn send(
    http: &reqwest::Client,
    keys: &Keys,
    sub: &Subscription,
    payload: &PushPayload,
) -> Result<bool> {
    let plaintext = serde_json::to_vec(payload).context("序列化推送内容失败")?;
    let body = encrypt(&sub.p256dh, &sub.auth, &plaintext)?;
    let auth = vapid_header(keys, &sub.endpoint)?;

    let resp = http
        .post(&sub.endpoint)
        .header("content-encoding", "aes128gcm")
        .header("content-type", "application/octet-stream")
        .header("ttl", "86400")
        .header("authorization", auth)
        .body(body)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let code = r.status();
            if code.is_success() {
                return Ok(true);
            }
            // 410 Gone / 404 Not Found：订阅已被浏览器或推送服务丢弃
            if code.as_u16() == 404 || code.as_u16() == 410 {
                return Ok(false);
            }
            Err(anyhow!("推送服务返回 {code}"))
        }
        Err(e) => Err(anyhow!("连接推送服务失败：{e}")),
    }
}

/// aes128gcm 加密（RFC 8291 §3.4）
fn encrypt(p256dh_b64: &str, auth_b64: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let ua_public_bytes = B64.decode(p256dh_b64).context("订阅公钥不是合法 base64url")?;
    let auth_secret = B64.decode(auth_b64).context("订阅 auth 不是合法 base64url")?;
    let ua_public = PublicKey::from_sec1_bytes(&ua_public_bytes).context("订阅公钥不是 P-256 点")?;

    let as_secret = SecretKey::random(&mut p256::elliptic_curve::rand_core::OsRng);
    let as_public = as_secret.public_key().to_encoded_point(false);

    let shared = p256::ecdh::diffie_hellman(as_secret.to_nonzero_scalar(), ua_public.as_affine());
    let shared = shared.raw_secret_bytes();

    // auth_info = "WebPush: info" || 0x00 || ua_public || as_public
    let mut auth_info = Vec::with_capacity(14 + 65 + 65);
    auth_info.extend_from_slice(b"WebPush: info\0");
    auth_info.extend_from_slice(ua_public_bytes.as_slice());
    auth_info.extend_from_slice(as_public.as_bytes());

    let mut ikm = [0u8; 32];
    Hkdf::<Sha256>::new(Some(&auth_secret), shared.as_slice())
        .expand(&auth_info, &mut ikm)
        .map_err(|_| anyhow!("派生推送密钥失败"))?;

    let mut salt = [0u8; 16];
    rand::rng().fill_bytes(&mut salt);

    let hk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut cek = [0u8; 16];
    hk.expand(b"Content-Encoding: aes128gcm\0", &mut cek)
        .map_err(|_| anyhow!("派生内容密钥失败"))?;
    let mut nonce = [0u8; 12];
    hk.expand(b"Content-Encoding: nonce\0", &mut nonce)
        .map_err(|_| anyhow!("派生 nonce 失败"))?;

    // 单条记录以 0x02 结尾（RFC 8188 的最后一条记录分隔符）
    let mut record = Vec::with_capacity(plaintext.len() + 1);
    record.extend_from_slice(plaintext);
    record.push(0x02);

    let cipher = Aes128Gcm::new_from_slice(&cek).map_err(|_| anyhow!("初始化 AES 失败"))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), record.as_ref())
        .map_err(|_| anyhow!("加密推送内容失败"))?;

    // header = salt(16) | rs(4) | idlen(1) | keyid(65)
    let mut body = Vec::with_capacity(16 + 4 + 1 + 65 + ciphertext.len());
    body.extend_from_slice(&salt);
    body.extend_from_slice(&4096u32.to_be_bytes());
    body.push(as_public.as_bytes().len() as u8);
    body.extend_from_slice(as_public.as_bytes());
    body.extend_from_slice(&ciphertext);
    Ok(body)
}

/// VAPID 授权头。JWT 的 aud 必须是推送服务的 origin。
fn vapid_header(keys: &Keys, endpoint: &str) -> Result<String> {
    let origin = endpoint_origin(endpoint)?;
    let exp = chrono::Utc::now().timestamp() + 12 * 3600;
    let header = serde_json::json!({ "typ": "JWT", "alg": "ES256" });
    let claims = serde_json::json!({ "aud": origin, "exp": exp, "sub": keys.subject });

    let h = B64.encode(serde_json::to_vec(&header)?);
    let c = B64.encode(serde_json::to_vec(&claims)?);
    let signing_input = format!("{h}.{c}");

    let secret_bytes = B64.decode(&keys.private_b64).context("VAPID 私钥损坏")?;
    let signing_key = SigningKey::from_slice(&secret_bytes).context("VAPID 私钥不合法")?;
    let sig: Signature = signing_key.sign(signing_input.as_bytes());
    let token = format!("{signing_input}.{}", B64.encode(sig.to_bytes()));

    Ok(format!("vapid t={token}, k={}", keys.public_b64))
}

/// `https://fcm.googleapis.com/…` → `https://fcm.googleapis.com`
fn endpoint_origin(endpoint: &str) -> Result<String> {
    let scheme_end = endpoint.find("://").ok_or_else(|| anyhow!("推送地址缺少协议"))?;
    let rest = &endpoint[scheme_end + 3..];
    let host_end = rest.find('/').unwrap_or(rest.len());
    Ok(endpoint[..scheme_end + 3 + host_end].to_string())
}

/// 后台触发：按受众取订阅并逐个发送，返回（成功数, 失败数）。
pub async fn broadcast(
    http: &reqwest::Client,
    pool: &PgPool,
    keys: &Keys,
    payload: &PushPayload,
    audience: &str,
) -> (usize, usize) {
    let sql = match audience {
        "signed_in" => "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IS NOT NULL",
        "admins" => {
            "SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s
             JOIN users u ON u.id = s.user_id WHERE u.role = 'admin'"
        }
        _ => "SELECT id, endpoint, p256dh, auth FROM push_subscriptions",
    };

    let rows: Vec<(String, String, String, String)> = match sqlx::query_as(sql).fetch_all(pool).await
    {
        Ok(v) => v,
        Err(_) => return (0, 0),
    };

    let mut ok = 0usize;
    let mut fail = 0usize;
    for (id, endpoint, p256dh, auth) in rows {
        let sub = Subscription { id: id.clone(), endpoint, p256dh, auth };
        match send(http, keys, &sub, payload).await {
            Ok(true) => {
                ok += 1;
                let _ = sqlx::query(
                    "UPDATE push_subscriptions SET last_ok_at = now(), fail_count = 0 WHERE id = $1",
                )
                .bind(&id)
                .execute(pool)
                .await;
            }
            Ok(false) => {
                // 订阅已失效，直接清掉，避免每次都失败
                fail += 1;
                let _ = sqlx::query("DELETE FROM push_subscriptions WHERE id = $1")
                    .bind(&id)
                    .execute(pool)
                    .await;
            }
            Err(_) => {
                fail += 1;
                let _ = sqlx::query(
                    "UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = $1",
                )
                .bind(&id)
                .execute(pool)
                .await;
            }
        }
    }
    (ok, fail)
}
