//! 新闻：前台只读已发布，后台可维护栏目与稿件。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{FixedOffset, NaiveDate, TimeZone};
use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::news::{self, ArticlePatch, ColumnPatch, Filter, NewArticle, NewColumn};
use crate::state::AppState;

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

/// `YYYY-MM-DD` → 上海时区当天零点的毫秒时间戳；`end=true` 时取次日零点（左闭右开）
fn day_ms(raw: &str, end: bool) -> Option<i64> {
    let d = NaiveDate::parse_from_str(raw.trim(), "%Y-%m-%d").ok()?;
    let d = if end { d.succ_opt()? } else { d };
    let tz = FixedOffset::east_opt(8 * 3600)?;
    tz.from_local_datetime(&d.and_hms_opt(0, 0, 0)?)
        .single()
        .map(|dt| dt.timestamp_millis())
}

#[derive(Deserialize)]
pub struct ListQuery {
    column: Option<String>,
    from: Option<String>,
    to: Option<String>,
    limit: Option<i64>,
}

impl ListQuery {
    fn filter(&self) -> Filter<'_> {
        Filter {
            column: self.column.as_deref().filter(|s| !s.is_empty()),
            from: self.from.as_deref().and_then(|s| day_ms(s, false)),
            to: self.to.as_deref().and_then(|s| day_ms(s, true)),
            limit: self.limit.unwrap_or(50).clamp(1, 300),
        }
    }
}

// ── 前台 ───────────────────────────────────────────────

/// GET /api/v1/news/columns
pub async fn public_columns(State(st): State<AppState>) -> ApiResult<Response> {
    let items = news::list_columns(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/news?column=&from=&to=&limit=
pub async fn public_list(
    State(st): State<AppState>,
    Query(q): Query<ListQuery>,
) -> ApiResult<Response> {
    let items = news::list(&st.pool, true, q.filter())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/news/{id}
pub async fn public_one(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let item = news::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    match item {
        Some(a) if a.published => Ok(Json(json!({ "ok": true, "item": a })).into_response()),
        _ => Err(ApiError::not_found()),
    }
}

// ── 后台：新闻 ─────────────────────────────────────────

/// GET /api/v1/admin/news —— 含草稿
pub async fn admin_list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<ListQuery>,
) -> ApiResult<Response> {
    let mut filter = q.filter();
    filter.limit = q.limit.unwrap_or(200).clamp(1, 500);
    let items = news::list(&st.pool, false, filter)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/news
pub async fn create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let title = text(&obj, "title");
    let summary = text(&obj, "summary");
    let body_text = obj
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if let Some(msg) = news::validate(&title, &summary, &body_text) {
        return Err(ApiError::invalid_input(msg));
    }

    let column_id = text(&obj, "columnId");
    let entry = news::create(
        &st.pool,
        NewArticle {
            column_id: if column_id.is_empty() {
                None
            } else {
                Some(&column_id)
            },
            title: &title,
            summary: &summary,
            body: &body_text,
            cover: &text(&obj, "cover"),
            author: &text(&obj, "author"),
            source: &text(&obj, "source"),
            published: obj
                .get("published")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": entry })),
    )
        .into_response())
}

/// PATCH /api/v1/admin/news/{id}
pub async fn patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let title = obj.get("title").and_then(|v| v.as_str());
    let summary = obj.get("summary").and_then(|v| v.as_str());
    let body_text = obj.get("body").and_then(|v| v.as_str());
    if title.is_some() || summary.is_some() || body_text.is_some() {
        if let Some(msg) = news::validate(
            title.unwrap_or("标题"),
            summary.unwrap_or(""),
            body_text.unwrap_or(""),
        ) {
            return Err(ApiError::invalid_input(msg));
        }
    }

    // columnId 允许显式传空串表示「不归档」
    let column = obj.get("columnId").map(|_| {
        let v = text(&obj, "columnId");
        if v.is_empty() { None } else { Some(v) }
    });

    let updated = news::update(
        &st.pool,
        &id,
        ArticlePatch {
            column_id: column.as_ref().map(|c| c.as_deref()),
            title,
            summary,
            body: body_text,
            cover: obj.get("cover").and_then(|v| v.as_str()),
            author: obj.get("author").and_then(|v| v.as_str()),
            source: obj.get("source").and_then(|v| v.as_str()),
            published: obj.get("published").and_then(|v| v.as_bool()),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// DELETE /api/v1/admin/news/{id}
pub async fn remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if news::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

// ── 后台：栏目 ─────────────────────────────────────────

/// GET /api/v1/admin/news/columns
pub async fn admin_columns(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = news::list_columns(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/news/columns
pub async fn create_column(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let name = text(&obj, "name");
    let intro = text(&obj, "intro");
    if let Some(msg) = news::validate_column(&name, &intro) {
        return Err(ApiError::invalid_input(msg));
    }

    let mut slug = news::slugify(&text(&obj, "slug"));
    if slug.is_empty() {
        slug = news::slugify(&name);
    }
    if slug.is_empty() {
        slug = crate::ids::next('k');
    }
    let existing = news::list_columns(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    if existing.iter().any(|c| c.slug == slug) {
        return Err(ApiError::invalid_input("这个栏目别名已被占用"));
    }

    let col = news::create_column(
        &st.pool,
        NewColumn {
            name: &name,
            slug: &slug,
            intro: &intro,
            sort: obj
                .get("sort")
                .and_then(|v| v.as_i64())
                .unwrap_or(100) as i32,
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": col })),
    )
        .into_response())
}

/// PATCH /api/v1/admin/news/columns/{id}
pub async fn patch_column(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let name = obj.get("name").and_then(|v| v.as_str());
    let intro = obj.get("intro").and_then(|v| v.as_str());
    if let Some(n) = name {
        if let Some(msg) = news::validate_column(n, intro.unwrap_or("")) {
            return Err(ApiError::invalid_input(msg));
        }
    }

    let slug = obj
        .get("slug")
        .and_then(|v| v.as_str())
        .map(news::slugify)
        .filter(|s| !s.is_empty());

    if let Some(s) = slug.as_deref() {
        let existing = news::list_columns(&st.pool)
            .await
            .map_err(ApiError::internal)?;
        if existing.iter().any(|c| c.slug == s && c.id != id) {
            return Err(ApiError::invalid_input("这个栏目别名已被占用"));
        }
    }

    let updated = news::update_column(
        &st.pool,
        &id,
        ColumnPatch {
            name,
            slug: slug.as_deref(),
            intro,
            sort: obj.get("sort").and_then(|v| v.as_i64()).map(|v| v as i32),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// DELETE /api/v1/admin/news/columns/{id} —— 栏目下的新闻不删，只变成「未归档」
pub async fn remove_column(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if news::delete_column(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}
