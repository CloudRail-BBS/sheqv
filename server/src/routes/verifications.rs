//! 认证申请接口。
//!
//! 用户侧：提交 / 查看 / 撤销自己的申请，**不能直接改认证标记**。
//! 后台侧：审核申请；直接授予走 `PATCH /api/v1/admin/users`（`verifyKind` / `verifyLabel`）。

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
use crate::verifications;

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

fn map_err(e: verifications::VerifyError) -> ApiError {
    match e {
        verifications::VerifyError::NotFound => ApiError::not_found(),
        verifications::VerifyError::AlreadyPending => ApiError::with_message(
            StatusCode::CONFLICT,
            "verification_pending",
            "你已经有一条待审核的认证申请，等管理员处理后再提交",
        ),
        verifications::VerifyError::Invalid(msg) => ApiError::invalid_input(msg),
        verifications::VerifyError::Db(err) => ApiError::internal(err),
    }
}

/* ── 用户 ───────────────────────────────── */

/// GET /api/v1/me/verification-requests
pub async fn mine(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Response> {
    let items = verifications::list_mine(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/me/verification-requests
pub async fn create(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let req = verifications::create(
        &st.pool,
        &user.id,
        &verifications::NewRequest {
            kind: &text(&obj, "kind"),
            subject: &text(&obj, "subject"),
            category: &text(&obj, "category"),
            evidence: &text(&obj, "evidence"),
            contact: &text(&obj, "contact"),
        },
    )
    .await
    .map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": req }))).into_response())
}

/// DELETE /api/v1/me/verification-requests/{id}
pub async fn cancel(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !verifications::cancel(&st.pool, &user.id, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/verification-requests?status=pending
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let status = q.get("status").map(String::as_str).unwrap_or("pending");
    let items = verifications::admin_list(&st.pool, status)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "items": items,
        "kinds": verifications::KINDS,
    }))
    .into_response())
}

/// PATCH /api/v1/admin/verification-requests/{id}
pub async fn admin_review(
    State(st): State<AppState>,
    actor: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let opt = |key: &str| {
        obj.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let kind = opt("kind");
    let label = opt("label");
    verifications::review(
        &st.pool,
        &id,
        &verifications::Review {
            status: &text(&obj, "status"),
            kind: kind.as_deref(),
            label: label.as_deref(),
            note: &text(&obj, "note"),
            reviewer: actor.user_id(),
        },
    )
    .await
    .map_err(map_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}
