//! 后台 / 运营面板鉴权。
//!
//! 两个层级：
//! - `AdminActor`：完整后台（`/admin`），只有 `role=admin` 进来；
//! - `OpsActor`：运营面板（`/ops`），管理员，或身份组勾了 `ops.console` 的账号。
//!
//! 两者都接受 `ADMIN_TOKEN` 应急通道（Bearer / `x-admin-token`），默认为空 = 不启用。
//! 判定失败统一 401 `unauthorized`，不区分"未登录"与"口令错"。

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode, header};
use subtle::ConstantTimeEq;

use crate::auth::session;
use crate::groups;
use crate::errors::ApiError;
use crate::state::AppState;
use crate::users::{self, PublicUser};

/// 通过鉴权的调用者：口令通道没有对应的用户
#[derive(Clone)]
pub struct AdminActor {
    pub user: Option<PublicUser>,
}

impl AdminActor {
    pub fn user_id(&self) -> Option<&str> {
        self.user.as_ref().map(|u| u.id.as_str())
    }
}

fn unauthorized() -> ApiError {
    let mut err = ApiError::with_message(
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "需要管理员账号登录（或配置了 ADMIN_TOKEN 时带 Bearer）",
    );
    err.headers.push((
        header::WWW_AUTHENTICATE,
        "Bearer realm=\"blockarena-admin\"".to_string(),
    ));
    err
}

fn token_from(headers: &HeaderMap) -> String {
    let bearer = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            let lower = v.to_ascii_lowercase();
            lower
                .starts_with("bearer ")
                .then(|| v[7..].trim().to_string())
        })
        .unwrap_or_default();
    if !bearer.is_empty() {
        return bearer;
    }
    headers
        .get("x-admin-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn token_ok(headers: &HeaderMap, expected: &str) -> bool {
    if expected.is_empty() {
        return false;
    }
    let got = token_from(headers);
    if got.is_empty() || got.len() != expected.len() {
        return false;
    }
    got.as_bytes().ct_eq(expected.as_bytes()).into()
}

async fn resolve(parts: &Parts, state: &AppState) -> Option<AdminActor> {
    if token_ok(
        &parts.headers,
        state.cfg.admin_token.as_deref().unwrap_or(""),
    ) {
        return Some(AdminActor { user: None });
    }

    let token = session::cookie_value(&parts.headers, session::SESSION_COOKIE)?;
    let now = chrono::Utc::now().timestamp();
    let user_id = session::verify_token(state.session_secret.as_slice(), &token, now)?;
    let row = users::find_by_id(&state.pool, &user_id)
        .await
        .ok()
        .flatten()?;
    if row.banned || row.role != "admin" {
        return None;
    }
    Some(AdminActor {
        user: Some(row.to_public()),
    })
}

/// 运营面板调用者：管理员，或所属身份组勾了「进入运营面板」的账号。
///
/// 权限范围只到运营面板要做的事（看数据、审帖子 / 认证 / 头衔），
/// 用户管理、站点设置这些仍然要 `AdminActor`。
#[derive(Clone)]
pub struct OpsActor {
    pub user: Option<PublicUser>,
}

impl OpsActor {
    pub fn user_id(&self) -> Option<&str> {
        self.user.as_ref().map(|u| u.id.as_str())
    }
}

fn ops_unauthorized() -> ApiError {
    ApiError::with_message(
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "需要运营权限：请让管理员在身份组里勾上「进入运营面板」",
    )
}

async fn resolve_ops(parts: &Parts, state: &AppState) -> Option<OpsActor> {
    if token_ok(
        &parts.headers,
        state.cfg.admin_token.as_deref().unwrap_or(""),
    ) {
        return Some(OpsActor { user: None });
    }

    let token = session::cookie_value(&parts.headers, session::SESSION_COOKIE)?;
    let now = chrono::Utc::now().timestamp();
    let user_id = session::verify_token(state.session_secret.as_slice(), &token, now)?;
    let row = users::find_by_id(&state.pool, &user_id)
        .await
        .ok()
        .flatten()?;
    if row.banned {
        return None;
    }
    // 管理员天然有运营权限；其他人看身份组里的 `ops.console`
    if row.role != "admin" {
        let ok = groups::can(&state.pool, &row.id, "ops.console").await.ok()?;
        if !ok {
            return None;
        }
    }
    Some(OpsActor {
        user: Some(row.to_public()),
    })
}

impl FromRequestParts<AppState> for OpsActor {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        resolve_ops(parts, state).await.ok_or_else(ops_unauthorized)
    }
}

impl FromRequestParts<AppState> for AdminActor {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        resolve(parts, state).await.ok_or_else(unauthorized)
    }
}
