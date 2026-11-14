//! 资源库的“从外部站点拉取”。
//!
//! - `GET  /api/v1/resources/discover`：搜 Modrinth / CurseForge，返回标准化条目（不落库）
//! - `POST /api/v1/resources/import`：把其中一条导入成本站资源（**仅管理员**）
//!
//! 导入不做二次确认：用户点「导入」就是把这条挂到自己名下，之后能像普通资源一样编辑/下架。

use axum::Json;
use axum::body::Bytes;
use axum::http::StatusCode;
use axum::extract::{Path, Query, State};
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
    // 「加载更多」用 offset 往后翻（Modrinth 是 offset、CurseForge 是页码，这里按条数算）
    let offset = q
        .get("offset")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, 900);

    let mirror = settings::flag(&settings::load(&st.pool, &st.cfg).await, "mcimMirror", false);

    let items = if source == "modrinth" {
        remote_sources::search_modrinth(&st.http, keyword, kind, limit, offset, mirror).await
    } else {
        let map = settings::load(&st.pool, &st.cfg).await;
        let key = settings::text(&map, "curseforgeKey");
        remote_sources::search_curseforge(&st.http, &key, keyword, kind, limit).await
    };

    match items {
        Ok(items) => {
            // 已经收进资源库的条目不再出现在外站列表里：收录完原卡就该消失，
            // 让位给资源库里那张正式的站内卡
            let items = drop_imported(&st.pool, source, items).await;
            Ok(Json(json!({ "ok": true, "source": source, "items": items })).into_response())
        }
        // 站点配置/网络问题不算 500：前端要拿到可读原因去引导用户
        Err(message) => Ok(Json(json!({ "ok": false, "source": source, "message": message }))
            .into_response()),
    }
}

/// 去掉已经收录过的条目（按 `(source, source_id)` 判断）
async fn drop_imported(
    pool: &sqlx::PgPool,
    source: &str,
    items: Vec<RemoteItem>,
) -> Vec<RemoteItem> {
    if items.is_empty() {
        return items;
    }
    let ids: Vec<String> = items.iter().map(|i| i.source_id.clone()).collect();
    let done: Vec<String> = sqlx::query_scalar(
        "SELECT source_id FROM resources
          WHERE source = $1 AND source_id = ANY($2) AND source_id <> ''",
    )
    .bind(source)
    .bind(&ids)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    if done.is_empty() {
        return items;
    }
    let set: std::collections::HashSet<String> = done.into_iter().collect();
    items
        .into_iter()
        .filter(|i| !set.contains(&i.source_id))
        .collect()
}

/// GET /api/v1/resources/remote/{source}/{id}
///
/// 外部条目在站内的「预览详情」：拉原站的项目详情（介绍正文 / 加载器 / 版本 / 授权 / 标签），
/// 让没收录权限的人也能在站内看完再决定去哪里下载。
pub async fn remote_detail(
    State(st): State<AppState>,
    Path((source, id)): Path<(String, String)>,
) -> ApiResult<Response> {
    if !remote_sources::ONLINE_SOURCES.contains(&source.as_str()) {
        return Err(ApiError::invalid_input("来源站不正确"));
    }

    // 已经收进资源库的，直接把站内 id 给前端，省得再拉一次详情
    let imported: Option<String> = sqlx::query_scalar(
        "SELECT id FROM resources
          WHERE source = $1 AND source_id = $2
          ORDER BY created_at LIMIT 1",
    )
    .bind(&source)
    .bind(&id)
    .fetch_optional(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    let map = settings::load(&st.pool, &st.cfg).await;
    let mirror = settings::flag(&map, "mcimMirror", false);
    let cf_key = settings::text(&map, "curseforgeKey");
    let detail = remote_sources::fetch_detail(&st.http, &source, &id, 0, &cf_key, mirror)
        .await
        .map_err(|e| ApiError::with_message(StatusCode::BAD_GATEWAY, "upstream_error", e))?;

    Ok(Json(json!({ "ok": true, "detail": detail, "importedId": imported })).into_response())
}

/// POST /api/v1/resources/import
/// body: { source, sourceId, url, title, summary, kind, category?, icon? }
pub async fn import(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    // 收录是以调用者的名义往资源库里建条目（作者=自己），等同于代站方发布，
    // 所以只对管理员开放；普通成员仍然可以自己「发布资源」。
    if !user.is_admin {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "forbidden",
            "外部资源收录只对管理员开放",
        ));
    }

    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };

    let source = text(&obj, "source");
    // rtsbox 不支持在线「搜索」（接口要关键词，且没有详情），但搜索结果能直接收录
    let known = remote_sources::ONLINE_SOURCES.contains(&source.as_str()) || source == "rtsbox";
    if !known {
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
        project_id: obj.get("projectId").and_then(|v| v.as_i64()).unwrap_or(0),
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
        // rtsbox 的下载直链在 cdn 子域，原帖在 www
        "rtsbox" => item.url.contains("rtsbox.cn"),
        _ => false,
    };
    if !host_ok {
        return Err(ApiError::invalid_input("来源链接与站点不匹配"));
    }

    // 分类：优先用前端选的，没选就按类型给个建议值 → 「其他」→ 第一个可用分类
    let cats = crate::categories::keys(&st.pool, "resource")
        .await
        .map_err(ApiError::internal)?;
    let wanted = text(&obj, "category");
    let suggest = remote_sources::suggest_category(&item.kind).to_string();
    let category = if !wanted.is_empty() && cats.iter().any(|c| c == &wanted) {
        wanted
    } else if cats.iter().any(|c| c == &suggest) {
        suggest
    } else if cats.iter().any(|c| c == "其他") {
        "其他".to_string()
    } else {
        cats.first().cloned().unwrap_or_default()
    };
    if category.is_empty() {
        return Err(ApiError::invalid_input("后台还没有配置资源分类"));
    }

    // 拉详情：把「介绍正文 / 加载器 / 支持版本 / 授权 / 标签」一起取回来，
    // 拉进来的条目才和站内自己发布的一样有内容。拉不到就用搜索那行简介兜底，不让导入失败。
    let cfg_map = settings::load(&st.pool, &st.cfg).await;
    let cf_key = settings::text(&cfg_map, "curseforgeKey");
    let mirror = settings::flag(&cfg_map, "mcimMirror", false);
    let detail = remote_sources::fetch_detail(
        &st.http,
        &source,
        &item.source_id,
        item.project_id,
        &cf_key,
        mirror,
    )
    .await
    .unwrap_or_default();

    // 管理员在收录弹窗里改过的字段以请求体为准；没改的仍按「详情 → 搜索结果 → 兜底」取
    let override_text = |key: &str| -> Option<String> {
        obj.get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    };

    // 简介：手填优先，其次详情，其次搜索结果的描述，最后兜底一句来源说明（上限 200 字）
    let raw_summary = if let Some(v) = override_text("summary") {
        v
    } else if !detail.summary.is_empty() {
        detail.summary.clone()
    } else if !item.summary.is_empty() {
        item.summary.clone()
    } else {
        format!("来自 {} 的条目，详情见原站", item.source)
    };
    let summary: String = raw_summary.trim().chars().take(200).collect();

    let license = if detail.license.trim().is_empty() {
        "作者保留"
    } else {
        detail.license.trim()
    };
    // 原帖地址（rtsbox 的搜索结果会带；Minecraft 站留空，详情页用来源徽章跳转）
    let src_page = text(&obj, "sourceUrl");

    // 原站标题偶尔超长（>60 字会被本站校验拒掉），截断总比整条导入失败好
    let title: String = item.title.trim().chars().take(60).collect();

    // 正文：管理员改过就用改过的，否则用详情里抓来的介绍
    let body_override = override_text("body");
    let body_text: &str = body_override
        .as_deref()
        .unwrap_or(detail.body.as_str());

    // 封面：手动贴的优先，其次详情里的 icon/logo，最后搜索结果的 icon（都是原站图床地址）
    let cover_override = override_text("cover");
    let cover = if let Some(v) = cover_override.as_deref() {
        v
    } else if !detail.icon.trim().is_empty() {
        detail.icon.trim()
    } else {
        item.icon.trim()
    };

    // rtsbox 是铁锈战争的模组站，其余两个站都是 Minecraft；弹窗里能改
    let default_game = if source == "rtsbox" { "rusted_warfare" } else { item.game() };
    let game_override = override_text("game");
    let game = match game_override.as_deref() {
        Some("minecraft") => "minecraft",
        Some("rusted_warfare") => "rusted_warfare",
        _ => default_game,
    };

    // 标签 / 支持版本 / 加载器同样允许在收录前调整
    let tags_override: Option<Vec<String>> = obj.get("tags").and_then(|v| v.as_array()).map(|a| {
        a.iter()
            .filter_map(|t| t.as_str())
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .take(6)
            .collect::<Vec<_>>()
    });
    let tags_final = tags_override
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| detail.tags.clone());
    let versions_override = override_text("gameVersions");
    let loaders_override = override_text("loaders");

    let input = NewResource {
        title: &title,
        summary: &summary,
        body: body_text,
        game,
        category: &category,
        tags: tags_final,
        team_id: None,
        url: &item.url,
        version: "",
        license,
        size_bytes: 0,
        game_versions: versions_override.as_deref().unwrap_or(detail.game_versions.as_str()),
        loaders: loaders_override.as_deref().unwrap_or(detail.loaders.as_str()),
        deps: "",
        source_url: &src_page,
        cover,
        source: &source,
        source_id: &item.source_id,
        source_kind: &item.kind,
    };
    if let Some(msg) = resources::validate(&input, &cats) {
        return Err(ApiError::invalid_input(msg));
    }

    // 同一个项目只收一次：卡片是「点一下就进库」的，重复点不能每次都多一份
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM resources
          WHERE source = $1 AND source_id = $2
          ORDER BY created_at LIMIT 1",
    )
    .bind(&source)
    .bind(&item.source_id)
    .fetch_optional(&st.pool)
    .await
    .map_err(ApiError::internal)?;
    if let Some(id) = existing {
        return Ok(Json(json!({ "ok": true, "id": id, "existing": true })).into_response());
    }

    let id = resources::create(&st.pool, &user.id, &input, &[], "published")
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "id": id })).into_response())
}
