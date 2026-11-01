//! 百科接口：公开读，管理员写。

use std::collections::HashMap;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::wiki::{self, CATEGORIES, NewEntry, PatchEntry};

/// GET /api/v1/wiki?category=intro&q=
pub async fn list(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let items = wiki::list(
        &st.pool,
        q.get("category").map(String::as_str),
        q.get("q").map(String::as_str),
    )
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "items": items, "categories": CATEGORIES })).into_response())
}

/// GET /api/v1/wiki/{slug}
pub async fn get(State(st): State<AppState>, Path(slug): Path<String>) -> ApiResult<Response> {
    let entry = wiki::get(&st.pool, &slug)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    let related = wiki::related(&st.pool, &entry.category, &entry.id, 4)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "entry": entry, "related": related })).into_response())
}

/// GET /api/v1/admin/wiki —— 含草稿
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = wiki::admin_list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

fn validate(title: &str, summary: &str, body: &str, category: &str) -> Option<String> {
    let t = title.trim().chars().count();
    if !(2..=60).contains(&t) {
        return Some("标题需为 2–60 字".into());
    }
    if summary.trim().chars().count() > 200 {
        return Some("摘要不超过 200 字".into());
    }
    let b = body.trim().chars().count();
    if b < 20 {
        return Some("正文至少 20 字".into());
    }
    if b > 20000 {
        return Some("正文不超过 20000 字".into());
    }
    if !CATEGORIES.contains(&category) {
        return Some("分类不正确".into());
    }
    None
}

fn slugify(raw: &str) -> String {
    let s: String = raw
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.trim_matches('-').to_string();
    // 中文标题压不出可读 slug，交给调用方回落成 id
    s.chars().take(48).collect()
}

fn tags_of(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .take(5)
                .collect()
        })
        .unwrap_or_default()
}

/// POST /api/v1/admin/wiki
pub async fn admin_create(
    State(st): State<AppState>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(author_id) = actor.user_id().map(str::to_string) else {
        return Err(ApiError::forbidden());
    };
    let Ok(obj) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let text = |key: &str| {
        obj.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string()
    };

    let title = text("title");
    let summary = text("summary");
    let content = text("body");
    let category = {
        let c = text("category");
        if c.is_empty() { "intro".to_string() } else { c }
    };
    if let Some(msg) = validate(&title, &summary, &content, &category) {
        return Err(ApiError::invalid_input(msg));
    }

    let slug = slugify(&text("slug"));
    let input = NewEntry {
        title: &title,
        slug: &slug,
        summary: &summary,
        body: &content,
        category: &category,
        tags: obj.get("tags").map(tags_of).unwrap_or_default(),
        published: obj.get("published").and_then(|v| v.as_bool()).unwrap_or(true),
        author_id: &author_id,
    };

    match wiki::create(&st.pool, &input)
        .await
        .map_err(ApiError::internal)?
    {
        Some(entry) => Ok((StatusCode::CREATED, Json(json!({ "ok": true, "entry": entry }))).into_response()),
        None => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "slug_exists",
            "这个地址标识已被别的词条占用",
        )),
    }
}

/// PATCH /api/v1/admin/wiki/{id}
pub async fn admin_update(
    State(st): State<AppState>,
    Path(id): Path<String>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(editor_id) = actor.user_id().map(str::to_string) else {
        return Err(ApiError::forbidden());
    };
    let Ok(obj) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let text = |key: &str| obj.get(key).and_then(|v| v.as_str()).map(str::to_string);

    let title = text("title");
    let summary = text("summary");
    let content = text("body");
    let category = text("category");

    // 只改一部分时也要能过校验：缺的字段用占位值跳过
    if let Some(msg) = validate(
        title.as_deref().unwrap_or("标题"),
        summary.as_deref().unwrap_or(""),
        content.as_deref().unwrap_or(&"x".repeat(20)),
        category.as_deref().unwrap_or("intro"),
    ) {
        return Err(ApiError::invalid_input(msg));
    }

    let patch = PatchEntry {
        title: title.as_deref(),
        summary: summary.as_deref(),
        body: content.as_deref(),
        category: category.as_deref(),
        tags: obj.get("tags").map(tags_of),
        published: obj.get("published").and_then(|v| v.as_bool()),
    };

    match wiki::update(&st.pool, &id, &patch, &editor_id)
        .await
        .map_err(ApiError::internal)?
    {
        Some(entry) => Ok(Json(json!({ "ok": true, "entry": entry })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// DELETE /api/v1/admin/wiki/{id}
pub async fn admin_remove(
    State(st): State<AppState>,
    Path(id): Path<String>,
    _: AdminActor,
) -> ApiResult<Response> {
    let removed = wiki::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if !removed {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/wiki/{slug}/revisions —— 公开的历史版本列表
pub async fn revisions(
    State(st): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Response> {
    let Some(id) = wiki::id_by_slug(&st.pool, &slug)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    let items = wiki::revisions(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/wiki/{slug}/revisions/{revId} —— 某个版本的完整内容
pub async fn revision(
    State(st): State<AppState>,
    Path((slug, rev_id)): Path<(String, String)>,
) -> ApiResult<Response> {
    let Some(id) = wiki::id_by_slug(&st.pool, &slug)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    let item = wiki::revision(&st.pool, &id, &rev_id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "revision": item })).into_response())
}

/// POST /api/v1/admin/wiki/{id}/restore —— 回滚到某个历史版本
pub async fn admin_restore(
    State(st): State<AppState>,
    Path(id): Path<String>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(editor_id) = actor.user_id().map(str::to_string) else {
        return Err(ApiError::forbidden());
    };
    let Ok(obj) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let Some(rev_id) = obj.get("revisionId").and_then(|v| v.as_str()) else {
        return Err(ApiError::invalid_input("缺少版本号"));
    };

    match wiki::restore(&st.pool, &id, rev_id, &editor_id)
        .await
        .map_err(ApiError::internal)?
    {
        Some(entry) => Ok(Json(json!({ "ok": true, "entry": entry })).into_response()),
        None => Err(ApiError::not_found()),
    }
}
