use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::users;

/// PATCH /api/v1/me —— 目前只开放头衔。
///
/// 昵称是帖子里已经落盘的作者名，改名会让历史帖子指向空，
/// 要做的话得先把帖子改成纯按 id 关联，不在这次范围内。
pub async fn patch_me(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    };

    let Some(obj) = payload.as_object() else {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    };
    let Some(title) = obj.get("title") else {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    };

    // 非字符串一律当空处理：与 Node 版 `typeof raw === 'string' ? raw : ''` 一致
    let raw = title.as_str().unwrap_or("");
    let clean = users::normalize_title(raw, user.is_admin).map_err(|msg| {
        ApiError::with_message(StatusCode::UNPROCESSABLE_ENTITY, "invalid_title", msg)
    })?;

    let updated = users::set_title(&st.pool, &user.id, Some(clean.as_str()))
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "user": updated })).into_response())
}
