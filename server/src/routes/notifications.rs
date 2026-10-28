use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{notifications, users};

/// GET /api/v1/notifications —— 顶栏面板与通知页共用
pub async fn list(State(st): State<AppState>, MaybeUser(maybe): MaybeUser) -> ApiResult<Response> {
    let (items, unread) = notifications::feed(&st.pool, maybe.as_ref())
        .await
        .map_err(ApiError::internal)?;

    let mut res = Json(json!({
        "ok": true,
        "loggedIn": maybe.is_some(),
        "unread": unread,
        "items": items,
    }))
    .into_response();
    res.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
    Ok(res)
}

/// POST /api/v1/notifications/read  body?: { at?: number } —— 不传 at 表示"读到现在"
pub async fn read(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(user) = maybe else {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "need_login"));
    };

    let payload: serde_json::Value =
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    let requested = payload.get("at").and_then(|v| v.as_i64());
    let read_at = match requested {
        Some(at) => {
            // 允许推到指定时间，但不允许回退
            users::mark_notifications_read_at(&st.pool, &user.id, at)
                .await
                .map_err(ApiError::internal)?
        }
        None => users::mark_notifications_read(&st.pool, &user.id)
            .await
            .map_err(ApiError::internal)?,
    };
    // 业务通知按行标已读；评论仍走上面的时间水位
    notifications::mark_all_read(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "readAt": read_at })).into_response())
}
