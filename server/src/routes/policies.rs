//! 政策：前台只读已发布，后台可增删改；内置政策可编辑但不可删除。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::policies::{self, NewPolicy, PatchPolicy};
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

/// GET /api/v1/policies
pub async fn list(State(st): State<AppState>) -> ApiResult<Response> {
    let items = policies::list(&st.pool, true)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/policies/{slug}
pub async fn get(State(st): State<AppState>, Path(slug): Path<String>) -> ApiResult<Response> {
    let Some(item) = policies::get(&st.pool, &slug, true)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// GET /api/v1/admin/policies
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = policies::list(&st.pool, false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/policies
pub async fn admin_create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let input: NewPolicy = serde_json::from_value(Value::Object(payload))
        .map_err(|_| ApiError::invalid_input("政策字段不完整"))?;
    if let Some(msg) = policies::validate(&input.title, &input.slug) {
        return Err(ApiError::invalid_input(msg));
    }

    let Some(item) = policies::create(&st.pool, &input)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "slug_exists",
            "这个标识已被使用",
        ));
    };
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

/// PATCH /api/v1/admin/policies/{slug}
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(slug): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let patch: PatchPolicy = serde_json::from_value(Value::Object(payload))
        .map_err(|_| ApiError::invalid_input("政策字段不正确"))?;
    if let Some(title) = &patch.title {
        if let Some(msg) = policies::validate(title, &slug) {
            return Err(ApiError::invalid_input(msg));
        }
    }

    let Some(item) = policies::update(&st.pool, &slug, &patch)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/policies/{slug}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path(slug): Path<String>,
) -> ApiResult<Response> {
    if let Some(item) = policies::get(&st.pool, &slug, false)
        .await
        .map_err(ApiError::internal)?
    {
        if item.builtin {
            return Err(ApiError::with_message(
                StatusCode::FORBIDDEN,
                "builtin_policy",
                "内置政策不能删除，可以下架或修改内容",
            ));
        }
    }
    let removed = policies::remove(&st.pool, &slug)
        .await
        .map_err(ApiError::internal)?;
    if !removed {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
