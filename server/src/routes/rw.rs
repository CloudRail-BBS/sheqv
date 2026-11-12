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

    let (mods, mod_error) = match rw_sources::search_rtsbox(&st.http, &keyword, page).await {
        Ok(v) => (v, None),
        Err(e) => (Vec::new(), Some(e)),
    };
    let (maps, map_error) =
        match rw_sources::search_rw_maps(&st.http, &token, &keyword, page, limit).await {
            Ok(v) => (v, None),
            Err(e) => (Vec::new(), Some(e)),
        };

    Ok(Json(json!({
        "ok": true,
        "mods": mods,
        "maps": maps,
        "modError": mod_error,
        "mapError": map_error,
    }))
    .into_response())
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
