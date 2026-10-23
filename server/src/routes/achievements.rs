use axum::Json;
use axum::extract::{Path, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{achievements, users};

/// GET /api/v1/achievements —— 全站徽章表（列表页批量渲染作者徽章用）
pub async fn map(State(st): State<AppState>) -> ApiResult<Response> {
    let map = achievements::map(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let mut res = Json(json!({ "ok": true, "map": map })).into_response();
    res.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
    Ok(res)
}

/// GET /api/v1/achievements/:userId —— 单人的进度与已得
pub async fn one(State(st): State<AppState>, Path(user_id): Path<String>) -> ApiResult<Response> {
    let row = users::find_by_id(&st.pool, &user_id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    let state = achievements::state(&st.pool, &row.to_public())
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "earned": state.earned, "all": state.all })).into_response())
}
