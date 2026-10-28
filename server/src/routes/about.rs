//! 「关于社区」接口：公开读取 + 后台增删改。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::about::{self, EntryInput};
use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::settings;
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

fn s(map: &Map<String, Value>, key: &str) -> String {
    map.get(key).and_then(|v| v.as_str()).unwrap_or_default().trim().to_string()
}

/// GET /api/v1/about —— 前台一次性取齐：介绍文案 + 人员 + 合作单位
pub async fn public(State(st): State<AppState>) -> ApiResult<Response> {
    let s_map = settings::load(&st.pool, &st.cfg).await;
    let (people, partners) = futures_util::try_join!(
        about::list(&st.pool, "person", true),
        about::list(&st.pool, "partner", true)
    )
    .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "intro": settings::text(&s_map, "aboutIntro"),
        "join": settings::text(&s_map, "aboutJoin"),
        "people": people,
        "partners": partners,
    }))
    .into_response())
}

/// GET /api/v1/admin/about?kind= —— 后台列表（含隐藏项）
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Response> {
    let kind = q.get("kind").cloned().unwrap_or_else(|| "person".into());
    let kind = if kind == "partner" { "partner" } else { "person" };
    let items = about::list(&st.pool, kind, false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/about —— 新增
pub async fn admin_create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(b) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };
    let kind = s(&b, "kind");
    if kind != "person" && kind != "partner" {
        return Err(ApiError::invalid_input("kind 只能是 person 或 partner"));
    }
    let name = s(&b, "name");
    if name.is_empty() {
        return Err(ApiError::invalid_input("名称不能为空"));
    }

    let entry = about::create(
        &st.pool,
        &EntryInput {
            kind,
            name: name.chars().take(40).collect(),
            role: s(&b, "role").chars().take(40).collect(),
            bio: s(&b, "bio").chars().take(300).collect(),
            avatar: s(&b, "avatar"),
            url: s(&b, "url"),
            sort: b.get("sort").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            visible: b.get("visible").and_then(|v| v.as_bool()).unwrap_or(true),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "item": entry })).into_response())
}

/// PATCH /api/v1/admin/about/{id}
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(b) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };
    let item = about::update(&st.pool, &id, &b)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/about/{id}
pub async fn admin_remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !about::remove(&st.pool, &id).await.map_err(ApiError::internal)? {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
