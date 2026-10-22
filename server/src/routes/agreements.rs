use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::agreements;
use crate::auth::session;
use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

/// GET /api/v1/agreements —— 生效中的公约（公开）
pub async fn list(State(st): State<AppState>) -> ApiResult<Response> {
    let items = agreements::list_active(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "items": items })).into_response())
}

/// GET /api/v1/agreements/signatures —— 当前账号的签署状态
pub async fn signatures(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
) -> ApiResult<Response> {
    let Some(user) = maybe else {
        return Ok(Json(json!({ "ok": true, "loggedIn": false, "items": [] })).into_response());
    };

    let rows = agreements::signatures_of(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    let items: Vec<_> = rows
        .into_iter()
        .map(|(id, version, at)| json!({ "id": id, "version": version, "at": at }))
        .collect();

    Ok(Json(json!({ "ok": true, "loggedIn": true, "items": items })).into_response())
}

/// POST /api/v1/agreements/sign  body: { id }
/// 签署人取自会话；同时写 `signatures` 表与旧 Cookie（过渡期两套都认）
pub async fn sign(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(user) = maybe else {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "need_login",
            "请先登录再签署公约",
        ));
    };

    let payload: serde_json::Value =
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    let id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let agreement = agreements::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    let Some(agreement) = agreement.filter(|a| a.active) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "unknown_agreement"));
    };

    let at = agreements::sign(&st.pool, &user.id, &agreement.id, &agreement.version)
        .await
        .map_err(ApiError::internal)?;

    let mut res = Json(json!({
        "ok": true,
        "id": agreement.id,
        "version": agreement.version,
        "at": at,
        "nickname": user.nickname,
    }))
    .into_response();

    let mut cookie = format!(
        "ag_{}={}.{}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax",
        agreement.id, agreement.version, at
    );
    if session::is_secure(&headers) {
        cookie.push_str("; Secure");
    }
    if let Ok(value) = cookie.parse() {
        res.headers_mut().insert(header::SET_COOKIE, value);
    }

    Ok(res)
}
