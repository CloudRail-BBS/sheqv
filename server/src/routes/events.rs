//! 活动接口：前台浏览与参加，后台维护。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::{CurrentUser, MaybeUser};
use crate::errors::{ApiError, ApiResult};
use crate::events::{self, JoinError, NewEvent, PatchEvent};
use crate::state::AppState;

fn time_of(v: Option<&Value>) -> Option<DateTime<Utc>> {
    v.and_then(|x| x.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc))
}

/// GET /api/v1/events
pub async fn list(State(st): State<AppState>, MaybeUser(maybe): MaybeUser) -> ApiResult<Response> {
    let uid = maybe.as_ref().map(|u| u.id.as_str());
    let items = events::list(&st.pool, uid)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/events/{id}
pub async fn detail(
    State(st): State<AppState>,
    Path(id): Path<String>,
    MaybeUser(maybe): MaybeUser,
) -> ApiResult<Response> {
    let uid = maybe.as_ref().map(|u| u.id.as_str());
    let item = events::get(&st.pool, &id, uid)
        .await
        .map_err(ApiError::internal)?;
    match item {
        Some(e) if e.status != "draft" => Ok(Json(json!({ "ok": true, "event": e })).into_response()),
        _ => Err(ApiError::not_found()),
    }
}

/// POST /api/v1/events/{id}/join
pub async fn join(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    match events::join(&st.pool, &user.id, &id).await {
        Ok(()) => Ok(Json(json!({ "ok": true })).into_response()),
        Err(JoinError::NotFound) => Err(ApiError::not_found()),
        Err(JoinError::Closed) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "event_closed",
            "这个活动已经结束或还没开始",
        )),
        Err(JoinError::Db(e)) => Err(ApiError::internal(e)),
    }
}

/// DELETE /api/v1/events/{id}/join
pub async fn leave(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    events::leave(&st.pool, &user.id, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台 ───────────────────────────────── */

pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = events::admin_list(&st.pool, None)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

pub async fn admin_create(State(st): State<AppState>, _: AdminActor, body: Bytes) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
    if title.is_empty() || title.chars().count() > 40 {
        return Err(ApiError::invalid_input("活动标题 1–40 个字"));
    }
    let status = payload.get("status").and_then(|v| v.as_str()).unwrap_or("draft");
    if !matches!(status, "draft" | "open" | "ended") {
        return Err(ApiError::invalid_input("状态不正确"));
    }

    let id = events::create(
        &st.pool,
        &NewEvent {
            title,
            summary: payload.get("summary").and_then(|v| v.as_str()).unwrap_or(""),
            body: payload.get("body").and_then(|v| v.as_str()).unwrap_or(""),
            cover: payload.get("cover").and_then(|v| v.as_str()).unwrap_or(""),
            reward: payload.get("reward").and_then(|v| v.as_str()).unwrap_or(""),
            starts_at: time_of(payload.get("startsAt")),
            ends_at: time_of(payload.get("endsAt")),
            status,
            sort: payload.get("sort").and_then(|v| v.as_i64()).unwrap_or(0),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    let item = events::get(&st.pool, &id, None)
        .await
        .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "event": item }))).into_response())
}

pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    if let Some(status) = payload.get("status").and_then(|v| v.as_str()) {
        if !matches!(status, "draft" | "open" | "ended") {
            return Err(ApiError::invalid_input("状态不正确"));
        }
    }

    let done = events::patch(
        &st.pool,
        &id,
        &PatchEvent {
            title: payload.get("title").and_then(|v| v.as_str()),
            summary: payload.get("summary").and_then(|v| v.as_str()),
            body: payload.get("body").and_then(|v| v.as_str()),
            cover: payload.get("cover").and_then(|v| v.as_str()),
            reward: payload.get("reward").and_then(|v| v.as_str()),
            status: payload.get("status").and_then(|v| v.as_str()),
            sort: payload.get("sort").and_then(|v| v.as_i64()),
            starts_at: payload.get("startsAt").map(|v| time_of(Some(v))),
            ends_at: payload.get("endsAt").map(|v| time_of(Some(v))),
        },
    )
    .await
    .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    let item = events::get(&st.pool, &id, None)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "event": item })).into_response())
}

pub async fn admin_remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let done = events::remove(&st.pool, &id).await.map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
