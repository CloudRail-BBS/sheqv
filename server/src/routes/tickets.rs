//! 工单接口。
//!
//! 用户只能看自己的工单；管理员（`AdminActor`，兼容 ADMIN_TOKEN 应急通道）看全部并可回复、改状态。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::tickets::{self, TicketError};

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()?
        .as_object()
        .cloned()
}

fn text(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn map_err(e: TicketError) -> ApiError {
    match e {
        TicketError::NotFound => ApiError::not_found(),
        TicketError::Closed => ApiError::with_message(
            StatusCode::CONFLICT,
            "ticket_closed",
            "工单已经关闭，如需继续请新建一张",
        ),
        TicketError::Limit => ApiError::with_message(
            StatusCode::TOO_MANY_REQUESTS,
            "ticket_limit",
            "今天提交的工单太多了，请明天再来或补充到已有工单里",
        ),
        TicketError::Invalid(msg) => ApiError::invalid_input(msg),
        TicketError::Db(err) => ApiError::internal(err),
    }
}

/* ── 用户 ───────────────────────────────── */

/// GET /api/v1/me/tickets
pub async fn mine(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Response> {
    let status = q.get("status").map(String::as_str).unwrap_or("");
    let items = tickets::list(&st.pool, &user.id, status, 100)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "items": items,
        "categories": tickets::CATEGORIES,
        "statuses": tickets::STATUSES,
    }))
    .into_response())
}

/// POST /api/v1/me/tickets
pub async fn create(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let id = tickets::create(
        &st.pool,
        &user.id,
        &text(&obj, "category"),
        &text(&obj, "subject"),
        &text(&obj, "body"),
    )
    .await
    .map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "id": id }))).into_response())
}

/// GET /api/v1/me/tickets/{id}
pub async fn detail(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let Some(detail) = tickets::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if detail.ticket.user_id != user.id {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true, "item": detail })).into_response())
}

/// POST /api/v1/me/tickets/{id}/messages
pub async fn reply(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(detail) = tickets::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if detail.ticket.user_id != user.id {
        return Err(ApiError::not_found());
    }
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    tickets::reply(
        &st.pool,
        &id,
        Some(&user.id),
        "user",
        &text(&obj, "body"),
    )
    .await
    .map_err(map_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/// PATCH /api/v1/me/tickets/{id}  body: { status: open|closed }
pub async fn set_status(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(detail) = tickets::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if detail.ticket.user_id != user.id {
        return Err(ApiError::not_found());
    }
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let status = text(&obj, "status");
    if status != "closed" && status != "open" {
        return Err(ApiError::invalid_input("只能关闭或重新打开"));
    }
    tickets::set_status(&st.pool, &id, &status)
        .await
        .map_err(map_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/tickets?status=
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Response> {
    let status = q.get("status").map(String::as_str).unwrap_or("");
    let items = tickets::list(&st.pool, "", status, 200)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "items": items,
        "categories": tickets::CATEGORIES,
        "statuses": tickets::STATUSES,
    }))
    .into_response())
}

/// GET /api/v1/admin/tickets/{id}
pub async fn admin_detail(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let Some(detail) = tickets::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "item": detail })).into_response())
}

/// POST /api/v1/admin/tickets/{id}/messages
pub async fn admin_reply(
    State(st): State<AppState>,
    actor: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    tickets::reply(
        &st.pool,
        &id,
        actor.user_id(),
        "admin",
        &text(&obj, "body"),
    )
    .await
    .map_err(map_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/// PATCH /api/v1/admin/tickets/{id}  body: { status }
pub async fn admin_status(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    tickets::set_status(&st.pool, &id, &text(&obj, "status"))
        .await
        .map_err(map_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}
