//! 审核接口。
//!
//! 与其它后台接口不同：这里**不要求 role=admin**，而是要求 `audit.review` 权限点，
//! 这样管理员可以在后台新建一个「审核员」身份组，把审核工作交出去。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::users::PublicUser;
use crate::{audit, groups, settings};

/// 当前调用者必须有审核权限
async fn require_reviewer(st: &AppState, maybe: MaybeUser) -> Result<PublicUser, ApiError> {
    let user = maybe.0.ok_or_else(|| {
        ApiError::with_message(StatusCode::UNAUTHORIZED, "need_login", "请先登录")
    })?;
    if groups::can(&st.pool, &user.id, "audit.review")
        .await
        .map_err(ApiError::internal)?
    {
        Ok(user)
    } else {
        Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "no_permission",
            "当前账号没有审核权限",
        ))
    }
}

/// GET /api/v1/admin/audit/posts —— 待审队列 + 计数
pub async fn pending(State(st): State<AppState>, maybe: MaybeUser) -> ApiResult<Response> {
    require_reviewer(&st, maybe).await?;

    let items = audit::pending(&st.pool, 100)
        .await
        .map_err(ApiError::internal)?;
    let (pending_count, rejected_count) =
        audit::counts(&st.pool).await.map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "items": items,
        "pendingCount": pending_count,
        "rejectedCount": rejected_count,
        "now": audit::now_ms(),
    }))
    .into_response())
}

/// POST /api/v1/admin/audit/posts/{id}  body: { approve: bool, reason?: string }
pub async fn review(
    State(st): State<AppState>,
    maybe: MaybeUser,
    Path(post_id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let reviewer = require_reviewer(&st, maybe).await?;

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let approve = payload
        .get("approve")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "invalid_body"))?;
    let reason = payload.get("reason").and_then(|v| v.as_str());

    // 拒绝必须给理由：作者要知道改什么
    if !approve && reason.map(|r| r.trim().is_empty()).unwrap_or(true) {
        return Err(ApiError::invalid_input("拒绝时请填写原因"));
    }

    let ok = audit::review_post(&st.pool, &post_id, approve, &reviewer.id, reason)
        .await
        .map_err(ApiError::internal)?;
    if !ok {
        return Err(ApiError::not_found());
    }

    let (pending_count, _) = audit::counts(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "pendingCount": pending_count })).into_response())
}

/// POST /api/v1/admin/audit/test —— 用当前 AI 配置跑一次样例，返回原始判定
///
/// 后台「测试」按钮用它：不真正发帖也能确认 baseUrl / key / model 是否通。
pub async fn test(
    State(st): State<AppState>,
    maybe: MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    require_reviewer(&st, maybe).await?;

    let payload = serde_json::from_slice::<Value>(&body).unwrap_or(Value::Null);
    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("测试标题");
    let body_text = payload
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("这是一条用于验证审核接口的测试内容。");

    let s = settings::load(&st.pool, &st.cfg).await;
    let Some(cfg) = crate::tms::config(&s) else {
        return Err(ApiError::with_message(
            StatusCode::BAD_REQUEST,
            "tms_not_configured",
            "请先填写腾讯云 SecretId / SecretKey",
        ));
    };

    match crate::tms::moderate(&st.ai_http, &cfg, title, body_text).await {
        Ok(None) => Ok(Json(json!({
            "ok": true,
            "verdict": { "risky": false, "score": 0.0, "labels": [], "reason": "腾讯云：Normal" }
        }))
        .into_response()),
        Ok(Some(reason)) => Ok(Json(json!({
            "ok": true,
            "verdict": { "risky": true, "score": 1.0, "labels": ["tms"], "reason": reason }
        }))
        .into_response()),
        Err(err) => {
            tracing::warn!(error = %err, "腾讯云内容安全自测失败");
            Err(ApiError::with_message(
                StatusCode::BAD_GATEWAY,
                "tms_failed",
                // 这里把原因带出去，管理员正在排障，需要看到上游说了什么
                format!("调用失败：{err}"),
            ))
        }
    }
}
