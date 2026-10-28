//! 头衔申请与徽章外观接口。
//!
//! 用户侧：只能提交 / 查看 / 撤销自己的申请，**不能直接改头衔**。
//! 后台侧：审核申请，以及给每个徽章指定样式与特效。

use std::collections::HashMap;

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
use crate::{achievements, titles};

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

fn map_err(e: titles::TitleError) -> ApiError {
    match e {
        titles::TitleError::NotFound => ApiError::not_found(),
        titles::TitleError::AlreadyPending => ApiError::with_message(
            StatusCode::CONFLICT,
            "title_pending",
            "你已经有一条待审核的头衔申请，等管理员处理后再提交",
        ),
        titles::TitleError::Invalid(msg) => ApiError::invalid_input(msg),
        titles::TitleError::Db(err) => ApiError::internal(err),
    }
}

/* ── 用户 ───────────────────────────────── */

/// GET /api/v1/me/title-requests
pub async fn mine(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Response> {
    let items = titles::list_mine(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/me/title-requests
pub async fn create(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let req = titles::create(
        &st.pool,
        &user.id,
        user.is_admin,
        &text(&obj, "title"),
        &text(&obj, "style"),
        &text(&obj, "effect"),
        &text(&obj, "reason"),
    )
    .await
    .map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": req }))).into_response())
}

/// DELETE /api/v1/me/title-requests/{id}
pub async fn cancel(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !titles::cancel(&st.pool, &user.id, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台：审核 ─────────────────────────── */

/// GET /api/v1/admin/title-requests?status=pending
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let status = q.get("status").map(String::as_str).unwrap_or("pending");
    let items = titles::admin_list(&st.pool, status)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// PATCH /api/v1/admin/title-requests/{id}
pub async fn admin_review(
    State(st): State<AppState>,
    actor: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let status = text(&obj, "status");
    let opt = |key: &str| {
        obj.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .map(str::to_string)
    };
    let title = opt("title");
    let style = opt("style");
    let effect = opt("effect");
    titles::review(
        &st.pool,
        &id,
        &titles::Review {
            status: &status,
            note: &text(&obj, "note"),
            title: title.as_deref(),
            style: style.as_deref(),
            effect: effect.as_deref(),
            reviewer: actor.user_id(),
        },
    )
    .await
    .map_err(map_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台：徽章外观 ─────────────────────── */

/// GET /api/v1/admin/badge-styles —— 目录 + 当前覆盖
pub async fn badge_styles(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let overrides = achievements::style_map(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let items: Vec<Value> = achievements::CATALOG
        .iter()
        .map(|b| {
            let (style, effect) = overrides.get(b.id).cloned().unwrap_or_default();
            json!({
                "id": b.id,
                "name": b.name,
                "desc": b.desc,
                "tone": b.tone,
                "style": style,
                "effect": effect,
            })
        })
        .collect();
    Ok(Json(json!({
        "ok": true,
        "items": items,
        "styles": titles::STYLES,
        "effects": titles::EFFECTS,
    }))
    .into_response())
}

/// PATCH /api/v1/admin/badge-styles/{badgeId} —— 空样式表示恢复默认语气色
pub async fn badge_style_set(
    State(st): State<AppState>,
    _: AdminActor,
    Path(badge_id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    if !achievements::CATALOG.iter().any(|b| b.id == badge_id) {
        return Err(ApiError::not_found());
    }
    let style = text(&obj, "style");
    let effect = text(&obj, "effect");
    if !style.is_empty() && !titles::valid_style(&style) {
        return Err(ApiError::invalid_input("样式不在可选范围"));
    }
    if !titles::valid_effect(&effect) {
        return Err(ApiError::invalid_input("特效不在可选范围"));
    }
    achievements::set_style(&st.pool, &badge_id, &style, &effect)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}
