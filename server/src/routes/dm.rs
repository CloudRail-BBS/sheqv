//! 私聊接口。
//!
//! 全部要求登录；身份只从会话里取，**不接受请求体里带 sender**。
//! 读消息不创建会话（不会因为误点凭空多一条空会话）。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::current_user::CurrentUser;
use crate::dm::{self, SendError};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::users;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

/// GET /api/v1/dm —— 会话列表
pub async fn list(State(st): State<AppState>, CurrentUser(me): CurrentUser) -> ApiResult<Response> {
    let items = dm::list(&st.pool, &me.id).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/dm/unread —— 未读总数（顶栏 / 侧栏徽标）
pub async fn unread(State(st): State<AppState>, CurrentUser(me): CurrentUser) -> ApiResult<Response> {
    let n = dm::unread_total(&st.pool, &me.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "unread": n })).into_response())
}

/// GET /api/v1/dm/{peerId}?before= —— 对话内容（倒序翻页，返回正序）
pub async fn thread(
    State(st): State<AppState>,
    CurrentUser(me): CurrentUser,
    Path(peer): Path<String>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Response> {
    let peer_row = users::find_by_id(&st.pool, &peer)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    let before = q.get("before").and_then(|v| v.parse::<i64>().ok());
    let messages = dm::thread(&st.pool, &me.id, &peer, before)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "peer": {
            "id": peer_row.id,
            "nickname": peer_row.nickname,
            "avatar": peer_row.avatar,
        },
        "messages": messages,
    }))
    .into_response())
}

/// POST /api/v1/dm/{peerId} —— 发一条
pub async fn send(
    State(st): State<AppState>,
    CurrentUser(me): CurrentUser,
    Path(peer): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(b) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };
    let text = b.get("body").and_then(|v| v.as_str()).unwrap_or_default();

    if users::find_by_id(&st.pool, &peer)
        .await
        .map_err(ApiError::internal)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    match dm::send(&st.pool, &me.id, &peer, text).await {
        Ok(message) => Ok(Json(json!({ "ok": true, "message": message })).into_response()),
        Err(SendError::Empty) => Err(ApiError::invalid_input("消息不能为空")),
        Err(SendError::TooLong) => Err(ApiError::invalid_input(format!(
            "单条消息最多 {} 字",
            dm::MAX_BODY
        ))),
        Err(SendError::SelfTalk) => Err(ApiError::invalid_input("不能给自己发私信")),
        Err(SendError::TooFast) => Err(ApiError::with_message(
            StatusCode::TOO_MANY_REQUESTS,
            "too_fast",
            "发得太快了，歇一分钟再发",
        )),
        Err(SendError::Db(e)) => Err(ApiError::internal(e)),
    }
}

/// POST /api/v1/dm/{peerId}/read —— 把已读位点推到最新
pub async fn read(
    State(st): State<AppState>,
    CurrentUser(me): CurrentUser,
    Path(peer): Path<String>,
) -> ApiResult<Response> {
    dm::mark_read(&st.pool, &me.id, &peer)
        .await
        .map_err(ApiError::internal)?;
    let unread = dm::unread_total(&st.pool, &me.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "unread": unread })).into_response())
}
