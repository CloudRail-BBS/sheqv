//! 铁锈战争的外部数据：模组（rtsbox）与地图（RELAY-CN 地图站）。
//!
//! - `GET /api/v1/rw/discover?q=&page=`：一次把两边的结果都取回来。
//!   模组必须有关键词（rtsbox 的接口限制），地图有关键词就搜、没有就随机取一批。
//! - `GET /api/v1/rw/maps/{id}/download`：地图的签名下载链接绑定我们的 IP/UA，
//!   前端拿到也用不了，所以由服务端拉流转发（不落盘）。

use std::collections::HashMap;
use std::time::Duration;

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

use serde_json::Value;

use crate::errors::{ApiError, ApiResult};
use crate::rw_sources;
use crate::settings;
use crate::state::AppState;

/// GET /api/v1/rw/discover?q=关键词&page=1&limit=8
pub async fn discover(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let keyword = q.get("q").cloned().unwrap_or_default();
    let page = q
        .get("page")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(1);
    let limit = q
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(8);

    let map = settings::load(&st.pool, &st.cfg).await;
    let token = settings::text(&map, "rwMapsToken");

    // 地图站的 search 时灵时不灵、random 每次都换一批，模组接口也慢；
    // 同一个关键词的整份结果缓存 3 分钟，翻页与刷新都直接吃缓存。
    // 缓存里有 token 变化的风险（换 token 后最多脏 3 分钟），可以接受。
    let cache_key = format!(
        "rw:discover:{}:{}:{}",
        if keyword.trim().is_empty() { "-" } else { keyword.trim() },
        page,
        limit
    );
    if let Some(hit) = st.cache.get(&cache_key).await {
        if let Ok(v) = serde_json::from_str::<Value>(&hit) {
            return Ok(Json(v).into_response());
        }
    }

    let (mods, mod_error) = match rw_sources::search_rtsbox(&st.http, &keyword, page).await {
        Ok(v) => (v, None),
        Err(e) => (Vec::new(), Some(e)),
    };
    let (maps, map_error) =
        match rw_sources::search_rw_maps(&st.http, &token, &keyword, page, limit).await {
            Ok(v) => (v, None),
            Err(e) => (Vec::new(), Some(e)),
        };

    let payload = json!({
        "ok": true,
        "mods": mods,
        "maps": maps,
        "modError": mod_error,
        "mapError": map_error,
    });
    // 只缓存拿到过内容的响应：两边都失败时不写，避免把一次故障钉住 3 分钟
    if !payload["mods"].as_array().map(|a| a.is_empty()).unwrap_or(true)
        || !payload["maps"].as_array().map(|a| a.is_empty()).unwrap_or(true)
    {
        if let Ok(text) = serde_json::to_string(&payload) {
            st.cache.set(&cache_key, &text, Duration::from_secs(180)).await;
        }
    }

    Ok(Json(payload).into_response())
}

/// GET /api/v1/rw/maps/{id}/download
pub async fn map_download(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if id.is_empty() || id.len() > 20 || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::not_found());
    }
    let map = settings::load(&st.pool, &st.cfg).await;
    let token = settings::text(&map, "rwMapsToken");
    let link = rw_sources::map_download_url(&st.http, &token, &id)
        .await
        .map_err(|e| {
            ApiError::with_message(StatusCode::BAD_GATEWAY, "upstream", &format!("地图站：{e}"))
        })?;

    // 地图包可能几十 MB，别用带 5 秒超时的那个公共客户端
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(ApiError::internal)?;
    let up = client
        .get(&link)
        .header("User-Agent", rw_sources::RW_UA)
        .send()
        .await
        .map_err(|e| {
            ApiError::with_message(StatusCode::BAD_GATEWAY, "upstream", &format!("取地图失败：{e}"))
        })?;
    if !up.status().is_success() {
        return Err(ApiError::with_message(
            StatusCode::BAD_GATEWAY,
            "upstream",
            &format!("地图站返回 {}", up.status()),
        ));
    }

    let is_zip = up
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("zip"))
        .unwrap_or(true);
    let filename = format!("rw-map-{id}.{}", if is_zip { "zip" } else { "tmx" });

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        );
    if let Some(len) = up.content_length() {
        builder = builder.header(header::CONTENT_LENGTH, len);
    }
    let body = Body::from_stream(up.bytes_stream());
    builder.body(body).map_err(ApiError::internal)
}
