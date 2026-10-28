//! 更新日志：前台只读已发布，后台可增删改。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::changelog::{self, EntryPatch, NewEntry};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

fn parse_body(body: &[u8]) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|v| v.as_object().cloned())
}

fn text(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// GET /api/v1/changelog —— 已发布的条目
pub async fn public_list(State(st): State<AppState>) -> ApiResult<Response> {
    let items = changelog::list(&st.pool, true)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/admin/changelog —— 含草稿
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = changelog::list(&st.pool, false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/changelog
pub async fn create(State(st): State<AppState>, _: AdminActor, body: Bytes) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let title = text(&obj, "title");
    let body_text = obj
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if let Some(msg) = changelog::validate(&title, &body_text) {
        return Err(ApiError::invalid_input(msg));
    }

    let tag = {
        let t = text(&obj, "tag");
        if t.is_empty() {
            "功能".to_string()
        } else {
            t
        }
    };

    let entry = changelog::create(
        &st.pool,
        NewEntry {
            version: &text(&obj, "version"),
            title: &title,
            body: &body_text,
            tag: &tag,
            published: obj
                .get("published")
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": entry })),
    )
        .into_response())
}

/// PATCH /api/v1/admin/changelog/{id}
pub async fn patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let title = obj.get("title").and_then(|v| v.as_str());
    let body_text = obj.get("body").and_then(|v| v.as_str());
    if let Some(t) = title {
        if let Some(msg) = changelog::validate(t, body_text.unwrap_or("")) {
            return Err(ApiError::invalid_input(msg));
        }
    }

    let updated = changelog::update(
        &st.pool,
        &id,
        EntryPatch {
            version: obj.get("version").and_then(|v| v.as_str()),
            title,
            body: body_text,
            tag: obj.get("tag").and_then(|v| v.as_str()),
            published: obj.get("published").and_then(|v| v.as_bool()),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// DELETE /api/v1/admin/changelog/{id}
pub async fn remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let ok = changelog::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}
