//! 页面渲染要用的公开读接口。
//!
//! 站点设置必须**白名单投影**：`geetestKey` / `afdianToken` / OAuth secret
//! 这些一旦下发到浏览器就等于泄漏，所以不能直接把 `settings` 表整份返回。

use axum::Json;
use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{announcements, settings, slides};

/// 可以给浏览器看的键
const PUBLIC_KEYS: [&str; 13] = [
    "siteName",
    "logoText",
    "logoImage",
    "geetestId",
    "afdianPageUrl",
    "footerText",
    "footerIcp",
    "footerLinks",
    "meGuestText",
    "loginHint",
    "registerHint",
    "allowRegister",
    "homeShowAnnouncements",
];

fn no_store(res: &mut Response) {
    res.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
}

/// GET /api/v1/settings —— 只读公开项
pub async fn settings(State(st): State<AppState>) -> ApiResult<Response> {
    let all = settings::load(&st.pool, &st.cfg).await;

    let mut out = Map::new();
    for key in PUBLIC_KEYS {
        if let Some(v) = all.get(key) {
            out.insert(key.to_string(), v.clone());
        }
    }
    // 空字符串表示"用默认文案"，前端自己兜底
    let mut res = Json(json!({ "ok": true, "settings": Value::Object(out) })).into_response();
    no_store(&mut res);
    Ok(res)
}

/// GET /api/v1/announcements —— 只看已发布
pub async fn announcements(State(st): State<AppState>) -> ApiResult<Response> {
    let items = announcements::list_published(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let mut res = Json(json!({ "ok": true, "items": items })).into_response();
    no_store(&mut res);
    Ok(res)
}

/// GET /api/v1/slides —— 只看启用中的
pub async fn slides(State(st): State<AppState>) -> ApiResult<Response> {
    let items = slides::list(&st.pool, true)
        .await
        .map_err(ApiError::internal)?;
    let mut res = Json(json!({ "ok": true, "items": items })).into_response();
    no_store(&mut res);
    Ok(res)
}
