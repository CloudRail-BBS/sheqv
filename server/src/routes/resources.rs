//! 资源库接口。
//!
//! 发布只需登录：第一个资源落库时自动获得开发者身份（见 `resources::create`）。
//! 点赞按用户唯一，下载按天去重；后台可下架但不预审。

use std::collections::HashMap;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::{CurrentUser, MaybeUser};
use crate::errors::{ApiError, ApiResult};
use crate::resources::{self, NewResource, ResourcePatch};
use crate::state::AppState;
use crate::{audit, groups, points, settings};

fn parse_body(body: &[u8]) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|v| v.as_object().cloned())
}

fn text(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn opt_text(obj: &Map<String, Value>, key: &str) -> Option<String> {
    obj.get(key).and_then(|v| v.as_str()).map(|s| s.trim().to_string())
}

fn tags(obj: &Map<String, Value>) -> Vec<String> {
    obj.get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str())
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .take(6)
                .collect()
        })
        .unwrap_or_default()
}

/// 附件 id 列表（最多 8 个，去空去重）
fn id_list(obj: &Map<String, Value>, key: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(arr) = obj.get(key).and_then(|v| v.as_array()) {
        for item in arr {
            let Some(raw) = item.as_str() else { continue };
            let id = raw.trim();
            if id.is_empty() || id.len() > 40 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
                continue;
            }
            if !out.iter().any(|v| v == id) {
                out.push(id.to_string());
            }
            if out.len() >= resources::MAX_FILES {
                break;
            }
        }
    }
    out
}

fn num(obj: &Map<String, Value>, key: &str) -> i64 {
    obj.get(key).and_then(|v| v.as_i64()).unwrap_or(0)
}

fn viewer(user: &Option<crate::users::PublicUser>) -> String {
    user.as_ref().map(|u| u.id.clone()).unwrap_or_default()
}

/// 作者本人、管理员、或有删帖权限的审核者
async fn can_manage(st: &AppState, user: &crate::users::PublicUser, author_id: &str) -> bool {
    if user.id == author_id || user.is_admin {
        return true;
    }
    groups::can(&st.pool, &user.id, "post.delete.any")
        .await
        .unwrap_or(false)
}

/// GET /api/v1/resources?game=&category=&q=&sort=new|likes|downloads
pub async fn list(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let viewer = viewer(&maybe);
    let q = params.get("q").map(String::as_str).filter(|s| !s.is_empty());
    let game = params.get("game").map(String::as_str).filter(|s| !s.is_empty());
    let category = params.get("category").map(String::as_str).filter(|s| !s.is_empty());
    let sort = params.get("sort").map(String::as_str).unwrap_or("new");
    let limit = params
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(30);

    let items = resources::list(&st.pool, &viewer, game, category, q, sort, limit)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items, "total": items.len() })).into_response())
}

/// GET /api/v1/resources/{id}
pub async fn detail(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let viewer = viewer(&maybe);
    let Some(item) = resources::get(&st.pool, &viewer, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };

    // 下架的只有作者与管理者能看
    if item.status != "published" {
        let allowed = match &maybe {
            Some(u) => can_manage(&st, u, &item.author_id).await,
            None => false,
        };
        if !allowed {
            return Err(ApiError::not_found());
        }
    }

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// POST /api/v1/resources
pub async fn create(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let team_id = opt_text(&obj, "teamId").filter(|v| !v.is_empty());
    let file_ids = id_list(&obj, "fileIds");
    let raw_url = text(&obj, "url");
    // 只上传了文件、没填外链时，主地址指向第一个附件
    let url = resources::effective_url(&raw_url, &file_ids);
    let input = NewResource {
        title: &text(&obj, "title"),
        summary: &text(&obj, "summary"),
        body: &text(&obj, "body"),
        game: &text(&obj, "game"),
        category: &text(&obj, "category"),
        tags: tags(&obj),
        team_id: team_id.as_deref(),
        url: &url,
        version: &text(&obj, "version"),
        license: &text(&obj, "license"),
        size_bytes: num(&obj, "sizeBytes").max(0),
        game_versions: &text(&obj, "gameVersions"),
        loaders: &text(&obj, "loaders"),
        deps: &text(&obj, "deps"),
        source_url: &text(&obj, "sourceUrl"),
    };

    if let Some(msg) = resources::validate(&input) {
        return Err(ApiError::invalid_input(msg));
    }

    if let Some(tid) = team_id.as_deref() {
        let member = resources::is_team_member(&st.pool, tid, &user.id)
            .await
            .map_err(ApiError::internal)?;
        if !member {
            return Err(ApiError::with_message(StatusCode::FORBIDDEN, "forbidden", "只能以自己所在的团队名义发布"));
        }
    }

    // 与发帖同一套审核策略：off 直接发布、ai 先过模型、all 全部待审
    let s = settings::load(&st.pool, &st.cfg).await;
    let text = format!("{}\n{}", input.summary, input.body);
    let pre = audit::precheck(&s, &st.ai_http, input.title, &text).await;

    let id = resources::create(&st.pool, &user.id, &input, &file_ids, pre.status)
        .await
        .map_err(ApiError::internal)?;

    if let Some(v) = &pre.verdict {
        audit::record_ai_for(&st.pool, "resource", &id, v).await;
    }

    // 发资源加分；失败只记日志，不影响发布
    if let Err(e) = points::award(
        &st.pool,
        &user.id,
        points::RESOURCE_REWARD,
        "resource",
        Some(&id),
    )
    .await
    {
        tracing::warn!(resource = %id, error = %e, "发放资源积分失败");
    }

    let item = resources::get(&st.pool, &user.id, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::internal("资源读取失败"))?;

    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

/// PATCH /api/v1/resources/{id}
pub async fn patch(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let Some(cur) = resources::get(&st.pool, &user.id, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if !can_manage(&st, &user, &cur.author_id).await {
        return Err(ApiError::with_message(StatusCode::FORBIDDEN, "forbidden", "只有作者或管理员能修改资源"));
    }

    let title = opt_text(&obj, "title").unwrap_or(cur.title.clone());
    let summary = opt_text(&obj, "summary").unwrap_or(cur.summary.clone());
    let body_text = opt_text(&obj, "body").unwrap_or(cur.body.clone().unwrap_or_default());
    let game = opt_text(&obj, "game").unwrap_or(cur.game.clone());
    let category = opt_text(&obj, "category").unwrap_or(cur.category.clone());
    let tags = if obj.contains_key("tags") { tags(&obj) } else { cur.tags.clone() };
    let team_id = if obj.contains_key("teamId") {
        opt_text(&obj, "teamId").filter(|v| !v.is_empty())
    } else {
        cur.team_id.clone()
    };
    let url_input = opt_text(&obj, "url");
    let file_ids = obj.contains_key("fileIds").then(|| id_list(&obj, "fileIds"));
    let url = match &file_ids {
        Some(ids) => resources::effective_url(
            url_input.as_deref().unwrap_or(cur.url.as_str()),
            ids,
        ),
        None => url_input.unwrap_or(cur.url.clone()),
    };
    let version = opt_text(&obj, "version").unwrap_or(cur.version.clone());
    let license = opt_text(&obj, "license").unwrap_or(cur.license.clone());
    let size_bytes = obj.get("sizeBytes").and_then(|v| v.as_i64()).unwrap_or(cur.size_bytes);
    let game_versions = opt_text(&obj, "gameVersions").unwrap_or(cur.game_versions.clone());
    let loaders = opt_text(&obj, "loaders").unwrap_or(cur.loaders.clone());
    let deps = opt_text(&obj, "deps").unwrap_or(cur.deps.clone());
    let source_url = opt_text(&obj, "sourceUrl").unwrap_or(cur.source_url.clone());

    let check = NewResource {
        title: &title,
        summary: &summary,
        body: &body_text,
        game: &game,
        category: &category,
        tags: tags.clone(),
        team_id: team_id.as_deref(),
        url: &url,
        version: &version,
        license: &license,
        size_bytes,
        game_versions: &game_versions,
        loaders: &loaders,
        deps: &deps,
        source_url: &source_url,
    };
    if let Some(msg) = resources::validate(&check) {
        return Err(ApiError::invalid_input(msg));
    }

    if let Some(tid) = team_id.as_deref() {
        if tid != cur.team_id.as_deref().unwrap_or("") {
            let member = resources::is_team_member(&st.pool, tid, &user.id)
                .await
                .map_err(ApiError::internal)?;
            if !member {
                return Err(ApiError::with_message(StatusCode::FORBIDDEN, "forbidden", "只能挂到自己所在的团队"));
            }
        }
    }

    let item = resources::patch(
        &st.pool,
        &id,
        &user.id,
        ResourcePatch {
            title: Some(&title),
            summary: Some(&summary),
            body: Some(&body_text),
            game: Some(&game),
            category: Some(&category),
            tags: Some(tags),
            team_id: Some(team_id.as_deref()),
            url: Some(&url),
            version: Some(&version),
            license: Some(&license),
            size_bytes: Some(size_bytes),
            game_versions: Some(&game_versions),
            loaders: Some(&loaders),
            deps: Some(&deps),
            source_url: Some(&source_url),
            file_ids,
        },
    )
    .await
    .map_err(ApiError::internal)?
    .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/resources/{id}
pub async fn remove(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let Some(cur) = resources::get(&st.pool, &user.id, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if !can_manage(&st, &user, &cur.author_id).await {
        return Err(ApiError::with_message(StatusCode::FORBIDDEN, "forbidden", "只有作者或管理员能删除资源"));
    }
    resources::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/// POST /api/v1/resources/{id}/like
pub async fn like(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let Some((liked, count)) = resources::toggle_like(&st.pool, &id, &user.id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "liked": liked, "likeCount": count })).into_response())
}

/// POST /api/v1/resources/{id}/download —— 登录用户按天去重；匿名只取链接不计数
pub async fn download(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let uid = maybe.as_ref().map(|u| u.id.as_str());
    let Some((url, count)) = resources::download(&st.pool, &id, uid)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "url": url, "downloadCount": count })).into_response())
}

/// POST /api/v1/resources/{id}/files/{fileId}/download
pub async fn download_attachment(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path((id, attachment_id)): Path<(String, String)>,
) -> ApiResult<Response> {
    let uid = maybe.as_ref().map(|u| u.id.as_str());
    let Some((url, file_downloads, total)) =
        resources::download_file(&st.pool, &id, &attachment_id, uid)
            .await
            .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({
        "ok": true,
        "url": url,
        "fileDownloads": file_downloads,
        "downloadCount": total,
    }))
    .into_response())
}

/// GET /api/v1/leaderboard/developers
pub async fn developer_board(State(st): State<AppState>) -> ApiResult<Response> {
    let developers = resources::developer_board(&st.pool, 20)
        .await
        .map_err(ApiError::internal)?;
    let teams = resources::dev_team_board(&st.pool, 20)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "developers": developers, "teams": teams })).into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/resources?q=
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let q = params.get("q").map(String::as_str).filter(|s| !s.is_empty());
    let items = resources::admin_list(&st.pool, q)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// PATCH /api/v1/admin/resources/{id}  body: { status: published|hidden }
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let status = text(&obj, "status");
    if !matches!(status.as_str(), "published" | "hidden") {
        return Err(ApiError::invalid_input("状态只能是 published 或 hidden"));
    }
    let done = resources::set_status(&st.pool, &id, &status)
        .await
        .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// DELETE /api/v1/admin/resources/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let done = resources::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
