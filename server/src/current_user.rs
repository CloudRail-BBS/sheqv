//! 从会话 Cookie 解析当前用户。
//!
//! 两种提取器：
//! * `CurrentUser` —— 需要登录的接口，未登录直接 401；
//! * `MaybeUser`   —— 可选登录的接口（如 `/auth/state`），匿名时为 `None`。

use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::auth::session;
use crate::errors::ApiError;
use crate::state::AppState;
use crate::users::{self, PublicUser};

pub struct CurrentUser(pub PublicUser);

pub struct MaybeUser(pub Option<PublicUser>);

/// 会话 → 用户。被封禁的账号即使持有旧 Cookie 也视为未登录。
async fn resolve(parts: &Parts, state: &AppState) -> Option<PublicUser> {
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
    Some(row.to_public())
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        resolve(parts, state)
            .await
            .map(CurrentUser)
            .ok_or_else(ApiError::need_login)
    }
}

impl FromRequestParts<AppState> for MaybeUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(MaybeUser(resolve(parts, state).await))
    }
}
