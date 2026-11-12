//! 资源库的“从外部站点拉取”。
//!
//! - `GET  /api/v1/resources/discover`：搜 Modrinth / CurseForge，返回标准化条目（不落库）
//! - `POST /api/v1/resources/import`：把其中一条导入成本站资源（登录可用）
//!
//! 导入不做二次确认：用户点「导入」就是把这条挂到自己名下，之后能像普通资源一样编辑/下架。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};
use std::collections::HashMap;

use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::remote_sources::{self, RemoteItem};
use crate::resources::{self, NewResource};
use crate::settings;
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<serde_json::Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

fn text(obj: &serde_json::Map<String, Value>, key: &str) -> String {
    obj.get(key).and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
}

/// GET /api/v1/resources/discover?source=modrinth&q=sodium&kind=mods&limit=12
pub async fn discover(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let source = q.get("source").map(String::as_str).unwrap_or("modrinth");
    if !remote_sources::ONLINE_SOURCES.contains(&source) {
        return Err(ApiError::invalid_input(
            "source 只支持 modrinth / curseforge（rtsbox 有反爬，请用「粘贴链接」建条目）",
        ));
    }
    let keyword = q.get("q").map(String::as_str).unwrap_or("").trim();
    let kind = q.get("kind").map(String::as_str).filter(|v| !v.is_empty());
    let limit = q
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(12);

    let items = if source == "modrinth" {
        remote_sources::search_modrinth(&st.http, keyword, kind, limit).await
    } else {
        let map = settings::load(&st.pool, &st.cfg).await;
        let key = settings::text(&map, "curseforgeKey");
        remote_sources::search_curseforge(&st.http, &key, keyword, kind, limit).await
    };

    match items {
        Ok(items) => Ok(Json(json!({ "ok": true, "source": source, "items": items })).into_response()),
        // 站点配置/网络问题不算 500：前端要拿到可读原因去引导用户
        Err(message) => Ok(Json(json!({ "ok": false, "source": source, "message": message }))
            .into_response()),
    }
}

/// POST /api/v1/resources/import
/// body: { source, sourceId, url, title, summary, kind, category?, icon? }
pub async fn import(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };

    let source = text(&obj, "source");
    if !remote_sources::ONLINE_SOURCES.contains(&source.as_str()) {
        return Err(ApiError::invalid_input("来源站不正确"));
    }
    let item = RemoteItem {
        source: source.clone(),
        source_id: text(&obj, "sourceId"),
        title: text(&obj, "title"),
        summary: text(&obj, "summary"),
        author: text(&obj, "author"),
        icon: text(&obj, "icon"),
        downloads: obj.get("downloads").and_then(|v| v.as_i64()).unwrap_or(0),
        url: text(&obj, "url"),
        kind: text(&obj, "kind"),
        updated: 0,
    };
    if item.title.is_empty() || item.source_id.is_empty() {
        return Err(ApiError::invalid_input("缺少标题或项目标识"));
    }
    if item.url.is_empty() {
        return Err(ApiError::invalid_input("缺少来源链接"));
    }
    // 只接受这两个站的地址，避免被当成任意外链的跳板
    let host_ok = match source.as_str() {
        "modrinth" => item.url.starts_with("https://modrinth.com/"),
        "curseforge" => item.url.starts_with("https://www.curseforge.com/")
            || item.url.starts_with("https://curseforge.com/"),
        _ => false,
    };
    if !host_ok {
        return Err(ApiError::invalid_input("来源链接与站点不匹配"));
    }

    // 分类：优先用前端选的，没选就按类型给个建议值，再不行取第一个可用分类
    let cats = crate::categories::keys(&st.pool, "resource")
        .await
        .map_err(ApiError::internal)?;
    let wanted = text(&obj, "category");
    let category = if !wanted.is_empty() && cats.iter().any(|c| c == &wanted) {
        wanted
    } else {
        let suggest = remote_sources::suggest_category(&item.kind).to_string();
        if cats.iter().any(|c| c == &suggest) {
            suggest
        } else {
            cats.first().cloned().unwrap_or_default()
        }
    };
    if category.is_empty() {
        return Err(ApiError::invalid_input("后台还没有配置资源分类"));
    }

    // 作者名放进简介尾部，备注来源，别让读者以为是本站原创
    let summary = if item.summary.is_empty() {
        format!("来自 {} 的条目", item.source)
    } else {
        item.summary.clone()
    };

    let input = NewResource {
        title: &item.title,
        summary: &summary,
        body: "",
        game: item.game(),
        category: &category,
        tags: Vec::new(),
        team_id: None,
        url: &item.url,
        version: "",
        license: "作者保留",
        size_bytes: 0,
        game_versions: "",
        loaders: "",
        deps: "",
        source_url: "",
        source: &source,
        source_id: &item.source_id,
        source_kind: &item.kind,
    };
    if let Some(msg) = resources::validate(&input, &cats) {
        return Err(ApiError::invalid_input(msg));
    }

    let id = resources::create(&st.pool, &user.id, &input, &[], "published")
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "id": id })).into_response())
}
