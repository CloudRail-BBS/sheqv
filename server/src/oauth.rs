//! 第三方登录（OAuth 2.0 授权码 + PKCE S256）。
//!
//! 两家都用同一套安全处理：
//! * `state` 防 CSRF：随机值同时写进 httpOnly Cookie 与授权 URL，回调时比对；
//! * PKCE 统一发（GitHub 也支持 S256），以后换 confidential 应用不用改；
//! * 令牌交换只在服务端做，access_token 不落盘、不下发。

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use rand::RngCore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub const STATE_COOKIE: &str = "oauth_state";
pub const VERIFIER_COOKIE: &str = "oauth_pkce";
pub const TTL_SECS: i64 = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Github,
    Cnkd,
}

impl Provider {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "github" => Some(Provider::Github),
            "cnkd" => Some(Provider::Cnkd),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Provider::Github => "github",
            Provider::Cnkd => "cnkd",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum OAuthError {
    #[error("{0}")]
    Failed(String),
    #[error("CNKD 账号当前状态不可用于登录")]
    AccountInactive,
}

impl OAuthError {
    pub fn code(&self) -> &'static str {
        match self {
            OAuthError::Failed(_) => "exchange_failed",
            OAuthError::AccountInactive => "account_inactive",
        }
    }
}

pub fn callback_url(base: &str, provider: Provider) -> String {
    format!(
        "{}/api/v1/auth/oauth/{}/callback",
        base.trim_end_matches('/'),
        provider.as_str()
    )
}

/// `verifier` 32 字节随机数的 base64url；`challenge` = base64url(sha256(verifier))
pub fn create_pkce() -> (String, String) {
    let mut buf = [0u8; 32];
    rand::rng().fill_bytes(&mut buf);
    let verifier = B64URL.encode(buf);
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = B64URL.encode(digest);
    (verifier, challenge)
}

pub fn create_state() -> String {
    let mut buf = [0u8; 16];
    rand::rng().fill_bytes(&mut buf);
    B64URL.encode(buf)
}

pub fn authorize_url(
    provider: Provider,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
) -> String {
    match provider {
        Provider::Github => {
            let mut url = url_with("https://github.com/login/oauth/authorize");
            url.query_pairs_mut()
                .append_pair("client_id", client_id)
                .append_pair("redirect_uri", redirect_uri)
                // 只读公开资料，不申请 email
                .append_pair("scope", "read:user")
                .append_pair("state", state)
                .append_pair("code_challenge", challenge)
                .append_pair("code_challenge_method", "S256");
            url.to_string()
        }
        Provider::Cnkd => {
            let mut url = url_with("https://cloud.cnkd.fun/account/oauth/authorize");
            url.query_pairs_mut()
                .append_pair("response_type", "code")
                .append_pair("client_id", client_id)
                .append_pair("redirect_uri", redirect_uri)
                .append_pair("scope", "profile.basic profile.status")
                .append_pair("state", state)
                .append_pair("code_challenge", challenge)
                .append_pair("code_challenge_method", "S256");
            url.to_string()
        }
    }
}

fn url_with(raw: &str) -> reqwest::Url {
    reqwest::Url::parse(raw).expect("固定地址")
}

async fn read_error(resp: reqwest::Response) -> String {
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if let Ok(v) = serde_json::from_str::<Value>(&text) {
        if let Some(s) = v["error"].as_str() {
            return s.to_string();
        }
        if let Some(s) = v["error"]["message"].as_str() {
            return s.to_string();
        }
        if let Some(s) = v["message"].as_str() {
            return s.to_string();
        }
    }
    let trimmed: String = text.chars().take(200).collect();
    if trimmed.is_empty() {
        format!("HTTP {status}")
    } else {
        trimmed
    }
}

/// 授权码换 access_token
pub async fn exchange_code(
    http: &reqwest::Client,
    provider: Provider,
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
    verifier: &str,
) -> Result<String, OAuthError> {
    let (url, body) = match provider {
        Provider::Github => (
            "https://github.com/login/oauth/access_token",
            json!({
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
            }),
        ),
        Provider::Cnkd => (
            "https://cloud.cnkd.fun/api-control/account/oauth/token",
            json!({
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
            }),
        ),
    };

    let resp = http
        .post(url)
        .header("accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|_| OAuthError::Failed("连不上平台授权接口".into()))?;

    let ok = resp.status().is_success();
    let data: Value = resp
        .json()
        .await
        .map_err(|_| OAuthError::Failed("平台返回的不是合法 JSON".into()))?;

    match provider {
        Provider::Github => {
            let token = data["access_token"].as_str().unwrap_or("");
            if !ok || token.is_empty() {
                return Err(OAuthError::Failed(
                    data["error_description"]
                        .as_str()
                        .or_else(|| data["error"].as_str())
                        .unwrap_or("GitHub 授权失败")
                        .to_string(),
                ));
            }
            Ok(token.to_string())
        }
        Provider::Cnkd => {
            let token = data["data"]["access_token"].as_str().unwrap_or("");
            if !ok || data["ok"].as_bool() != Some(true) || token.is_empty() {
                return Err(OAuthError::Failed(
                    data["error"]["message"]
                        .as_str()
                        .unwrap_or("CNKD 授权失败")
                        .to_string(),
                ));
            }
            Ok(token.to_string())
        }
    }
}

#[derive(Debug, Clone)]
pub struct Profile {
    pub sub: String,
    pub login: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

/// 读取用户资料；`sub` 必须是平台稳定唯一键（GitHub numeric id / CNKD sub）
pub async fn fetch_profile(
    http: &reqwest::Client,
    provider: Provider,
    access_token: &str,
) -> Result<Profile, OAuthError> {
    match provider {
        Provider::Github => {
            let resp = http
                .get("https://api.github.com/user")
                .header("accept", "application/vnd.github+json")
                .header("user-agent", "blockarena")
                .bearer_auth(access_token)
                .send()
                .await
                .map_err(|_| OAuthError::Failed("连不上 GitHub API".into()))?;

            let status_ok = resp.status().is_success();
            if !status_ok {
                let msg = read_error(resp).await;
                return Err(OAuthError::Failed(msg));
            }
            let data: Value = resp
                .json()
                .await
                .map_err(|_| OAuthError::Failed("GitHub 返回的不是合法 JSON".into()))?;

            let id = data["id"]
                .as_i64()
                .or_else(|| data["id"].as_str().and_then(|s| s.parse().ok()));
            let login = data["login"].as_str().unwrap_or("");
            let Some(id) = id else {
                return Err(OAuthError::Failed("GitHub 资料缺少 id".into()));
            };
            if login.is_empty() {
                return Err(OAuthError::Failed("GitHub 资料缺少 login".into()));
            }

            Ok(Profile {
                sub: id.to_string(),
                login: login.to_string(),
                display_name: data["name"].as_str().map(str::to_string),
                avatar: data["avatar_url"].as_str().map(str::to_string),
            })
        }
        Provider::Cnkd => {
            let resp = http
                .get("https://cloud.cnkd.fun/api-control/account/oauth/userinfo")
                .header("accept", "application/json")
                .bearer_auth(access_token)
                .send()
                .await
                .map_err(|_| OAuthError::Failed("连不上 CNKD API".into()))?;

            if !resp.status().is_success() {
                let msg = read_error(resp).await;
                return Err(OAuthError::Failed(msg));
            }
            let data: Value = resp
                .json()
                .await
                .map_err(|_| OAuthError::Failed("CNKD 返回的不是合法 JSON".into()))?;

            if data["ok"].as_bool() != Some(true) {
                return Err(OAuthError::Failed(
                    data["error"]["message"]
                        .as_str()
                        .unwrap_or("CNKD 资料读取失败")
                        .to_string(),
                ));
            }

            let info = &data["data"];
            let Some(sub) = info["sub"].as_str().filter(|s| !s.is_empty()) else {
                return Err(OAuthError::Failed("CNKD 资料缺少 sub".into()));
            };
            // 只有 active 的账号能用于生态授权
            if let Some(status) = info["accountStatus"].as_str() {
                if status != "active" {
                    return Err(OAuthError::AccountInactive);
                }
            }

            let login = info["username"]
                .as_str()
                .or_else(|| info["displayName"].as_str())
                .map(str::to_string)
                .unwrap_or_else(|| sub.chars().take(8).collect());

            Ok(Profile {
                sub: sub.to_string(),
                login,
                display_name: info["displayName"].as_str().map(str::to_string),
                avatar: info["avatarUrl"].as_str().map(str::to_string),
            })
        }
    }
}
