//! 客户端版本：公开取最新版，后台发布/修改/下线。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::app_releases::{self, NewRelease, PatchRelease, CHANNELS, PLATFORMS};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

/// GET /api/v1/app/latest?platform=android&channel=stable
pub async fn latest(
    State(st): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Response> {
    let platform = q.get("platform").map(String::as_str).unwrap_or("android");
    let channel = q.get("channel").map(String::as_str).unwrap_or("stable");
    if !PLATFORMS.contains(&platform) {
        return Err(ApiError::invalid_input("平台不正确"));
    }
    if !CHANNELS.contains(&channel) {
        return Err(ApiError::invalid_input("通道不正确"));
    }
    let item = app_releases::latest(&st.pool, platform, channel)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// GET /api/v1/admin/apps
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = app_releases::list(&st.pool, false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/apps
pub async fn admin_create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let input: NewRelease = serde_json::from_value(Value::Object(payload))
        .map_err(|_| ApiError::invalid_input("版本字段不完整"))?;
    if let Some(msg) = app_releases::validate(
        &input.platform,
        &input.channel,
        &input.version,
        input.build,
        &input.download_url,
        &input.notes,
        &input.sha256,
    ) {
        return Err(ApiError::invalid_input(msg));
    }
    let Some(item) = app_releases::create(&st.pool, &input)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "build_exists",
            "该平台/通道下 build 号已存在",
        ));
    };
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

/// PATCH /api/v1/admin/apps/{id}
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let patch: PatchRelease = serde_json::from_value(Value::Object(payload))
        .map_err(|_| ApiError::invalid_input("版本字段不正确"))?;

    let Some(cur) = app_releases::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    let version = patch.version.as_deref().unwrap_or(&cur.version);
    let build = patch.build.unwrap_or(cur.build);
    let url = patch.download_url.as_deref().unwrap_or(&cur.download_url);
    let notes = patch.notes.as_deref().unwrap_or(&cur.notes);
    let sha = patch.sha256.as_deref().unwrap_or(&cur.sha256);
    if let Some(msg) = app_releases::validate(&cur.platform, &cur.channel, version, build, url, notes, sha) {
        return Err(ApiError::invalid_input(msg));
    }

    let Some(item) = app_releases::update(&st.pool, &id, &patch)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/apps/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let removed = app_releases::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if !removed {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
