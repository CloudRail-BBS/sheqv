//! 任务接口：前台看进度 / 领取，后台增删改。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::tasks::{self, TaskError, TaskInput, TaskPatch};

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

fn num(obj: &Map<String, Value>, key: &str) -> i64 {
    obj.get(key).and_then(Value::as_i64).unwrap_or(0)
}

fn flag(obj: &Map<String, Value>, key: &str, fallback: bool) -> bool {
    obj.get(key).and_then(Value::as_bool).unwrap_or(fallback)
}

/// GET /api/v1/tasks
pub async fn list(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Response> {
    let items = tasks::list(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/tasks/{id}/claim
pub async fn claim(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    match tasks::claim(&st.pool, &user.id, &id).await {
        Ok(balance) => Ok(Json(json!({ "ok": true, "points": balance })).into_response()),
        Err(TaskError::NotFound) => Err(ApiError::not_found()),
        Err(TaskError::NotReady) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "not_ready",
            "还没完成，再努力一下",
        )),
        Err(TaskError::Claimed) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "already_claimed",
            "这一期已经领过了",
        )),
        Err(TaskError::Db(e)) => Err(ApiError::internal(e)),
    }
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/tasks
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
) -> ApiResult<Response> {
    let items = tasks::admin_list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/tasks
pub async fn admin_create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let input = TaskInput {
        title: &text(&obj, "title"),
        description: &text(&obj, "description"),
        kind: &text(&obj, "kind"),
        metric: &text(&obj, "metric"),
        target: num(&obj, "target").max(1),
        reward_points: num(&obj, "rewardPoints").max(0),
        sort: num(&obj, "sort"),
        enabled: flag(&obj, "enabled", true),
    };
    if let Some(msg) = tasks::validate(&input) {
        return Err(ApiError::invalid_input(msg));
    }
    let id = tasks::create(&st.pool, &input)
        .await
        .map_err(ApiError::internal)?;
    let item = tasks::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

/// PATCH /api/v1/admin/tasks/{id}
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(cur) = tasks::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let title = obj
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or(&cur.title)
        .to_string();
    let description = obj
        .get("description")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or(&cur.description)
        .to_string();
    let kind = obj
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or(&cur.kind)
        .to_string();
    let metric = obj
        .get("metric")
        .and_then(Value::as_str)
        .unwrap_or(&cur.metric)
        .to_string();
    let target = obj
        .get("target")
        .and_then(Value::as_i64)
        .unwrap_or(cur.target as i64);
    let reward_points = obj
        .get("rewardPoints")
        .and_then(Value::as_i64)
        .unwrap_or(cur.reward_points as i64);
    let sort = obj.get("sort").and_then(Value::as_i64).unwrap_or(cur.sort as i64);
    let enabled = obj
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(cur.enabled);

    let check = TaskInput {
        title: &title,
        description: &description,
        kind: &kind,
        metric: &metric,
        target,
        reward_points,
        sort,
        enabled,
    };
    if let Some(msg) = tasks::validate(&check) {
        return Err(ApiError::invalid_input(msg));
    }

    tasks::patch(
        &st.pool,
        &id,
        &TaskPatch {
            title: Some(&title),
            description: Some(&description),
            kind: Some(&kind),
            metric: Some(&metric),
            target: Some(target),
            reward_points: Some(reward_points),
            sort: Some(sort),
            enabled: Some(enabled),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    let item = tasks::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/tasks/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !tasks::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
