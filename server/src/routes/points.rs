//! 积分与签到接口。
//!
//! 积分对外的读接口只给「我自己」和「公开榜」，没有「查别人余额」——
//! 余额不是成就，拿来做对比只会变成攀比工具。

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};

use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::points::{self, PointError};
use crate::state::AppState;

fn point_err(e: PointError) -> ApiError {
    match e {
        PointError::NotFound => ApiError::not_found(),
        PointError::Db(err) => ApiError::internal(err),
    }
}

/// GET /api/v1/points —— 我的余额、连签、最近流水与榜单
pub async fn snapshot(State(st): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    let data = points::snapshot(&st.pool, &user.id)
        .await
        .map_err(point_err)?;
    Ok(Json(serde_json::json!({ "ok": true, "data": data })).into_response())
}

/// POST /api/v1/points/checkin
pub async fn checkin(State(st): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    let result = points::checkin(&st.pool, &user.id)
        .await
        .map_err(point_err)?;
    Ok(Json(serde_json::json!({ "ok": true, "data": result })).into_response())
}

/// GET /api/v1/points/rank?limit=20 —— 公开榜（只给昵称和分数）
pub async fn rank(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let limit = q
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(20);
    let items: Vec<(String, String, i32)> = sqlx::query_as(
        "SELECT id, nickname, points FROM users
          WHERE points > 0 ORDER BY points DESC, created_at ASC LIMIT $1",
    )
    .bind(limit.clamp(1, 50))
    .fetch_all(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    let items: Vec<_> = items
        .into_iter()
        .enumerate()
        .map(|(i, (id, nickname, points))| {
            serde_json::json!({
                "rank": i as i64 + 1,
                "userId": id,
                "nickname": nickname,
                "points": points,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "ok": true, "items": items })).into_response())
}
