use axum::Json;
use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{settings, sponsors};

/// GET /api/v1/sponsors —— 公开的赞助者名单（只含展示中的）
///
/// 页面自己读快照，这个接口给外部嵌入与自动化校验用。
pub async fn list(State(st): State<AppState>) -> ApiResult<Response> {
    let s = settings::load(&st.pool, &st.cfg).await;
    let configured = !settings::text(&s, "afdianUserId").is_empty()
        && !settings::text(&s, "afdianToken").is_empty();

    let snap = sponsors::snapshot(&st.pool, false, configured)
        .await
        .map_err(ApiError::internal)?;

    let mut res = Json(json!({
        "ok": true,
        "totalAmount": snap.total_amount,
        "count": snap.count,
        "syncedAt": snap.synced_at,
        "items": snap.sponsors,
    }))
    .into_response();
    res.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
    Ok(res)
}
