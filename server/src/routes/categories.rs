//! 分类接口：公开读（表单与筛选用），后台增删改。

use std::collections::HashMap;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::admin_auth::AdminActor;
use crate::categories::{self, Patch, RemoveError};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<Value> {
    serde_json::from_slice::<Value>(body).ok()
}

fn scope_arg(raw: Option<&str>) -> Result<String, ApiError> {
    let scope = raw.unwrap_or("wiki").trim();
    if categories::is_scope(scope) {
        Ok(scope.to_string())
    } else {
        Err(ApiError::invalid_input("分类用途不正确"))
    }
}

fn check_label(label: &str, descr: &str) -> Option<String> {
    let len = label.trim().chars().count();
    if len == 0 || len > 12 {
        return Some("分类名需 1–12 字".into());
    }
    if descr.trim().chars().count() > 60 {
        return Some("说明不能超过 60 字".into());
    }
    None
}

/// GET /api/v1/categories?scope=wiki
pub async fn list(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let scope = scope_arg(q.get("scope").map(String::as_str))?;
    let items = categories::list(&st.pool, &scope)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/admin/categories?scope=wiki —— 带内容数
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let scope = scope_arg(q.get("scope").map(String::as_str))?;
    let items = categories::admin_list(&st.pool, &scope)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/categories
pub async fn create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let scope = scope_arg(obj.get("scope").and_then(|v| v.as_str()))?;
    let label = obj.get("label").and_then(|v| v.as_str()).unwrap_or("");
    let descr = obj.get("descr").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(msg) = check_label(label, descr) {
        return Err(ApiError::invalid_input(msg));
    }
    let sort = obj
        .get("sort")
        .and_then(|v| v.as_i64())
        .map(|n| n.clamp(-9999, 9999) as i32);

    let item = categories::create(&st.pool, &scope, label, descr, sort)
        .await
        .map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": item })),
    )
        .into_response())
}

/// PATCH /api/v1/admin/categories/{scope}/{key}
pub async fn patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path((scope, key)): Path<(String, String)>,
    body: Bytes,
) -> ApiResult<Response> {
    let scope = scope_arg(Some(&scope))?;
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let label = obj.get("label").and_then(|v| v.as_str());
    let descr = obj.get("descr").and_then(|v| v.as_str());
    if let Some(l) = label {
        if let Some(msg) = check_label(l, descr.unwrap_or("")) {
            return Err(ApiError::invalid_input(msg));
        }
    } else if descr.is_some_and(|d| d.trim().chars().count() > 60) {
        return Err(ApiError::invalid_input("说明不能超过 60 字"));
    }
    let sort = obj
        .get("sort")
        .and_then(|v| v.as_i64())
        .map(|n| n.clamp(-9999, 9999) as i32);

    let updated = categories::update(
        &st.pool,
        &scope,
        &key,
        Patch {
            label,
            descr,
            sort,
        },
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// DELETE /api/v1/admin/categories/{scope}/{key}?moveTo=其他
pub async fn remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path((scope, key)): Path<(String, String)>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let scope = scope_arg(Some(&scope))?;
    let move_to = q.get("moveTo").map(String::as_str);

    match categories::remove(&st.pool, &scope, &key, move_to).await {
        Ok(out) => Ok(Json(json!({ "ok": true, "moved": out.moved })).into_response()),
        Err(RemoveError::InUse(n)) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "category_in_use",
            format!("还有 {n} 条内容在用这个分类，请先选择迁移到哪个分类"),
        )),
        Err(RemoveError::BadTarget) => Err(ApiError::invalid_input("迁移目标分类不存在")),
        Err(RemoveError::NotFound) => Err(ApiError::not_found()),
        Err(RemoveError::Db(e)) => Err(ApiError::internal(e)),
    }
}
