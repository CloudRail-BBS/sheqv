//! 资源库开放接口：给外部工具、导航站、自建站点的只读出口。
//!
//! 与站内 `/api/v1/resources` 的区别：
//! - 不需要登录，也不返回「是否点过赞」这类个人状态；
//! - 显式分页（limit/offset）并返回 total，方便翻页；
//! - 带 CORS，浏览器里可以直接 fetch。
//!
//! 只暴露已发布资源，下架/待审的一律 404，避免外部站点收录到不该公开的内容。

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::errors::{ApiError, ApiResult};
use crate::resources::{self, GAMES, SOURCE_KINDS, SOURCES};
use crate::state::AppState;

use std::collections::HashMap;

fn with_cors(mut resp: Response) -> Response {
    let h = resp.headers_mut();
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    h.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, OPTIONS"));
    h.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("content-type"),
    );
    // 一分钟缓存：外部站点不必每次都打穿到数据库
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=60"));
    resp
}

fn source_label(source: &str) -> &'static str {
    match source {
        "curseforge" => "CurseForge",
        "modrinth" => "Modrinth",
        "rtsbox" => "rtsbox",
        _ => "本站",
    }
}

fn game_label(game: &str) -> &'static str {
    match game {
        "minecraft" => "Minecraft",
        "rusted_warfare" => "Rusted Warfare",
        _ => "其他",
    }
}

/// GET /api/v1/public/resources?game=&category=&source=&q=&sort=&limit=&offset=
pub async fn list(
    State(st): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let pick = |k: &str| {
        params
            .get(k)
            .map(String::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty())
    };
    let game = pick("game");
    let category = pick("category");
    let source = pick("source");
    let q = pick("q");
    let sort = pick("sort").unwrap_or("new");
    let limit = params
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(20)
        .clamp(1, 100);
    let offset = params
        .get("offset")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0)
        .max(0);

    if let Some(g) = game {
        if !GAMES.contains(&g) {
            return Err(ApiError::invalid_input("game 只支持 minecraft / rusted_warfare"));
        }
    }
    if let Some(s) = source {
        if !SOURCES.contains(&s) {
            return Err(ApiError::invalid_input("source 只支持 curseforge / modrinth / rtsbox"));
        }
    }

    let items = resources::list(&st.pool, "", game, category, q, sort, source, limit, offset)
        .await
        .map_err(ApiError::internal)?;
    let total = resources::count(&st.pool, game, category, q, source)
        .await
        .map_err(ApiError::internal)?;

    Ok(with_cors(
        Json(json!({
            "ok": true,
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        }))
        .into_response(),
    ))
}

/// GET /api/v1/public/resources/{id}
pub async fn detail(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let Some(item) = resources::get(&st.pool, "", &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if item.status != "published" {
        return Err(ApiError::not_found());
    }
    Ok(with_cors(Json(json!({ "ok": true, "item": item })).into_response()))
}

/// GET /api/v1/public/meta —— 枚举值字典，外部接入时不必把常量抄一遍
pub async fn meta(State(st): State<AppState>) -> ApiResult<Response> {
    let cats = crate::categories::list(&st.pool, "resource")
        .await
        .map_err(ApiError::internal)?;

    let games: Vec<_> = GAMES
        .iter()
        .map(|g| {
            json!({
                "key": g,
                "label": game_label(g),
                "sources": resources::sources_for(g)
                    .iter()
                    .map(|s| json!({ "key": s, "label": source_label(s) }))
                    .collect::<Vec<_>>(),
            })
        })
        .collect();

    let sources: Vec<_> = SOURCES
        .iter()
        .map(|s| json!({ "key": s, "label": source_label(s) }))
        .collect();

    Ok(with_cors(
        Json(json!({
            "ok": true,
            "games": games,
            "sources": sources,
            "sourceKinds": SOURCE_KINDS,
            "categories": cats,
            "sort": ["new", "old", "likes", "downloads"],
        }))
        .into_response(),
    ))
}

/// OPTIONS 预检：浏览器里跨域 fetch 会先发这一发
pub async fn preflight() -> Response {
    with_cors(StatusCode::NO_CONTENT.into_response())
}
