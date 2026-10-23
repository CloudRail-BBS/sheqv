//! 后台接口。统一走 `AdminActor` 提取器（会话管理员或 ADMIN_TOKEN）。
//!
//! 用户管理有三条防锁死规则，**必须在同一个事务里判定**：
//! 1. 不能改自己的角色 / 封禁自己 / 删自己；
//! 2. 任何操作后至少剩一个可用管理员（`role=admin && !banned`）；
//! 3. 应急口令（无会话）可以操作，但同样受规则 2 约束。

use std::collections::HashMap;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::users;
use crate::{afdian, agreements, announcements, forum, settings, slides, sponsors};

fn qs(q: &HashMap<String, String>, key: &str) -> String {
    q.get(key).cloned().unwrap_or_default()
}

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()?
        .as_object()
        .cloned()
}

/* ── 用户 ───────────────────────────────── */

pub async fn list_users(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let rows = users::list(&st.pool).await.map_err(ApiError::internal)?;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows.iter().rev() {
        let mut v = serde_json::to_value(row.to_public()).map_err(ApiError::internal)?;
        if let (Some(obj), Some(ts)) = (v.as_object_mut(), row.last_login_at) {
            obj.insert("lastLoginAt".into(), json!(ts.timestamp_millis()));
        }
        items.push(v);
    }
    let admin_count = users::count_admins(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "items": items, "adminCount": admin_count })).into_response())
}

pub async fn patch_user(
    State(st): State<AppState>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }

    let role = payload
        .get("role")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    if let Some(r) = &role {
        if r != "admin" && r != "member" {
            return Err(ApiError::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_role",
            ));
        }
    }
    let banned = payload.get("banned").and_then(|v| v.as_bool());
    let has_title = payload.contains_key("title");

    // 规则 1：角色与封禁不能自操作（头衔可以）
    if actor.user_id() == Some(id.as_str()) && (role.is_some() || banned.is_some()) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "self_forbidden",
            "不能修改自己的角色或封禁自己",
        ));
    }

    let mut tx = st.pool.begin().await.map_err(ApiError::internal)?;

    let before: Option<(String, bool)> =
        sqlx::query_as("SELECT role, banned FROM users WHERE id = $1 FOR UPDATE")
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(ApiError::internal)?;

    let Some((before_role, before_banned)) = before else {
        return Err(ApiError::not_found());
    };

    // 头衔按「改完之后的角色」校验：正在被提为管理员的人可以直接用「管理员」
    let mut new_title: Option<Option<String>> = None;
    if has_title {
        let raw = payload.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let next_admin = role.clone().unwrap_or_else(|| before_role.clone()) == "admin";
        let checked = users::normalize_title(raw, next_admin).map_err(|msg| {
            ApiError::with_message(StatusCode::UNPROCESSABLE_ENTITY, "invalid_title", msg)
        })?;
        new_title = Some(if checked.is_empty() {
            None
        } else {
            Some(checked)
        });
    }

    // 规则 2：不能让可用管理员归零
    let losing_admin = before_role == "admin"
        && !before_banned
        && (role.as_deref() == Some("member") || banned == Some(true));

    if losing_admin {
        let admins: i64 =
            sqlx::query_scalar("SELECT count(*) FROM users WHERE role = 'admin' AND NOT banned")
                .fetch_one(&mut *tx)
                .await
                .map_err(ApiError::internal)?;
        if admins <= 1 {
            return Err(ApiError::with_message(
                StatusCode::CONFLICT,
                "last_admin",
                "这是最后一个可用管理员，不能降权或封禁",
            ));
        }
    }

    if let Some(r) = &role {
        sqlx::query("UPDATE users SET role = $2 WHERE id = $1")
            .bind(&id)
            .bind(r)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::internal)?;
    }
    if let Some(b) = banned {
        sqlx::query("UPDATE users SET banned = $2 WHERE id = $1")
            .bind(&id)
            .bind(b)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::internal)?;
    }
    if let Some(title) = new_title {
        sqlx::query("UPDATE users SET title = $2 WHERE id = $1")
            .bind(&id)
            .bind(title)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::internal)?;
    }

    tx.commit().await.map_err(ApiError::internal)?;

    let updated = users::find_by_id(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .map(|r| r.to_public())
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "user": updated })).into_response())
}

pub async fn delete_user(
    State(st): State<AppState>,
    actor: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let id = qs(&q, "id");
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }
    if actor.user_id() == Some(id.as_str()) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "self_forbidden",
            "不能删除自己",
        ));
    }

    let mut tx = st.pool.begin().await.map_err(ApiError::internal)?;
    let target: Option<(String, bool)> =
        sqlx::query_as("SELECT role, banned FROM users WHERE id = $1 FOR UPDATE")
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(ApiError::internal)?;

    let Some((role, banned)) = target else {
        return Err(ApiError::not_found());
    };

    if role == "admin" && !banned {
        let admins: i64 =
            sqlx::query_scalar("SELECT count(*) FROM users WHERE role = 'admin' AND NOT banned")
                .fetch_one(&mut *tx)
                .await
                .map_err(ApiError::internal)?;
        if admins <= 1 {
            return Err(ApiError::with_message(
                StatusCode::CONFLICT,
                "last_admin",
                "这是最后一个可用管理员，不能删除",
            ));
        }
    }

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::internal)?;
    tx.commit().await.map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 帖子 ───────────────────────────────── */

pub async fn list_posts(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = forum::list(&st.pool, None)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

pub async fn delete_post(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let id = qs(&q, "id");
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }
    let ok = forum::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

/* ── 站点设置 ───────────────────────────── */

pub async fn get_settings(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let effective = settings::load(&st.pool, &st.cfg).await;
    let overrides = settings::overrides(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "settings": effective, "overrides": overrides })).into_response())
}

pub async fn patch_settings(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    if let Some(key) = payload.get("resetKey").and_then(|v| v.as_str()) {
        let merged = settings::reset(&st.pool, key, &st.cfg)
            .await
            .map_err(ApiError::internal)?;
        return Ok(Json(json!({ "ok": true, "settings": merged })).into_response());
    }

    let mut patch = payload.clone();
    if let Some(logo) = patch.get("logoText").and_then(|v| v.as_str()) {
        let text = logo.trim();
        if text.chars().count() > 2 {
            return Err(ApiError::with_message(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_logo",
                "站点标识最多 2 个字",
            ));
        }
        patch.insert("logoText".into(), json!(text));
    }
    if let Some(img) = patch.get("logoImage").and_then(|v| v.as_str()) {
        let img = img.trim();
        if !img.is_empty()
            && !(img.starts_with("http://") || img.starts_with("https://") || img.starts_with('/'))
        {
            return Err(ApiError::with_message(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_logo",
                "标识图片需以 http(s):// 或 / 开头",
            ));
        }
        patch.insert("logoImage".into(), json!(img));
    }

    let merged = settings::update(&st.pool, &patch, &st.cfg)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "settings": merged })).into_response())
}

/* ── 公约 ───────────────────────────────── */

pub async fn list_agreements(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = agreements::list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "items": items })).into_response())
}

pub async fn create_agreement(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let text = |k: &str| {
        p.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string()
    };

    let clauses: Vec<agreements::Clause> = p
        .get("clauses")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    let h = c.get("h")?.as_str()?.trim().to_string();
                    let para = c.get("p")?.as_str()?.trim().to_string();
                    (!h.is_empty() && !para.is_empty()).then_some(agreements::Clause { h, p: para })
                })
                .collect()
        })
        .unwrap_or_default();

    let input = agreements::NewAgreement {
        title: text("title"),
        version: text("version"),
        scope: text("scope"),
        summary: text("summary"),
        gate: text("gate"),
        clauses,
    };
    if let Some(msg) = agreements::validate(&input) {
        return Err(ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, msg));
    }

    let item = agreements::create(&st.pool, &input)
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": item })),
    )
        .into_response())
}

pub async fn patch_agreement(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let Some(active) = p.get("active").and_then(|v| v.as_bool()) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_body"));
    };
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_body"));
    }
    if id == "trust" || id == "community" {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "builtin_locked"));
    }

    let ok = agreements::set_active(&st.pool, id, active)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

pub async fn delete_agreement(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let id = qs(&q, "id");
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }
    if id == "trust" || id == "community" {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "builtin_locked"));
    }
    let ok = agreements::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

/* ── 公告 ───────────────────────────────── */

pub async fn list_announcements(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = announcements::list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

pub async fn create_announcement(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let text = |k: &str| {
        p.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string()
    };
    let title = text("title");
    let content = text("body");
    if let Some(msg) = announcements::validate(&title, &content) {
        return Err(ApiError::invalid_input(msg));
    }

    let item = announcements::create(
        &st.pool,
        &title,
        &content,
        p.get("kind").and_then(|v| v.as_str()).unwrap_or("system"),
        p.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false),
        p.get("published").and_then(|v| v.as_bool()).unwrap_or(true),
    )
    .await
    .map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": item })),
    )
        .into_response())
}

pub async fn patch_announcement(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let id = p
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }

    let title = p.get("title").and_then(|v| v.as_str()).map(str::trim);
    let content = p.get("body").and_then(|v| v.as_str()).map(str::trim);
    if let (Some(t), Some(b)) = (title, content) {
        if let Some(msg) = announcements::validate(t, b) {
            return Err(ApiError::invalid_input(msg));
        }
    }

    let item = announcements::update(
        &st.pool,
        &id,
        announcements::Patch {
            title,
            body: content,
            kind: p.get("kind").and_then(|v| v.as_str()),
            pinned: p.get("pinned").and_then(|v| v.as_bool()),
            published: p.get("published").and_then(|v| v.as_bool()),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    match item {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

pub async fn delete_announcement(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let id = qs(&q, "id");
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }
    let ok = announcements::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

/* ── 轮播 ───────────────────────────────── */

pub async fn list_slides(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = slides::list(&st.pool, false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

pub async fn create_slide(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let s = |k: &str| p.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();

    if let Some(msg) = slides::validate(&s("title"), &s("desc"), &s("cta")) {
        return Err(ApiError::invalid_input(msg));
    }

    let item = slides::create(
        &st.pool,
        slides::Input {
            kicker: &s("kicker"),
            title: &s("title"),
            desc: &s("desc"),
            cta: &s("cta"),
            href: &s("href"),
            bg_color: &s("bgColor"),
            bg_image: &s("bgImage"),
            text_tone: &s("textTone"),
            active: p.get("active").and_then(|v| v.as_bool()).unwrap_or(true),
            order: p.get("order").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "item": item })),
    )
        .into_response())
}

pub async fn patch_slide(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let id = p
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }

    let s = |k: &str| p.get(k).and_then(|v| v.as_str());
    let item = slides::update(
        &st.pool,
        &id,
        slides::Patch {
            kicker: s("kicker"),
            title: s("title"),
            desc: s("desc"),
            cta: s("cta"),
            href: s("href"),
            bg_color: s("bgColor"),
            bg_image: s("bgImage"),
            text_tone: s("textTone"),
            active: p.get("active").and_then(|v| v.as_bool()),
            order: p.get("order").and_then(|v| v.as_i64()).map(|v| v as i32),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    match item {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

pub async fn delete_slide(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let id = qs(&q, "id");
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }
    let ok = slides::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

/* ── 赞助 ───────────────────────────────── */

fn afdian_configured(st: &AppState, s: &Map<String, Value>) -> bool {
    let _ = st;
    !settings::text(s, "afdianUserId").is_empty() && !settings::text(s, "afdianToken").is_empty()
}

pub async fn get_sponsors(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let s = settings::load(&st.pool, &st.cfg).await;
    let snap = sponsors::snapshot(&st.pool, true, afdian_configured(&st, &s))
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "snapshot": snap })).into_response())
}

pub async fn create_sponsor(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let amount = match p.get("amount") {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    };
    let plan = p.get("planTitle").and_then(|v| v.as_str());

    match sponsors::add_manual(&st.pool, name, amount, plan).await {
        Ok(item) => Ok((
            StatusCode::CREATED,
            Json(json!({ "ok": true, "item": item })),
        )
            .into_response()),
        Err(sponsors::ManualError::InvalidName) => Err(ApiError::invalid_input("名字需 1–24 字")),
        Err(sponsors::ManualError::InvalidAmount) => Err(ApiError::invalid_input("金额需大于 0")),
    }
}

pub async fn patch_sponsor(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let hidden = p.get("hidden").and_then(|v| v.as_bool());
    let (Some(id), Some(hidden)) = (Some(id).filter(|s| !s.is_empty()), hidden) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_body"));
    };
    let ok = sponsors::set_hidden(&st.pool, id, hidden)
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}

pub async fn delete_sponsor(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let id = qs(&q, "id");
    if id.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "missing_id"));
    }
    match sponsors::remove_manual(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        sponsors::RemoveResult::Ok => Ok(Json(json!({ "ok": true })).into_response()),
        sponsors::RemoveResult::NotFound => Err(ApiError::not_found()),
        sponsors::RemoveResult::NotManual => Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "not_manual",
            "爱发电条目只能隐藏，不能删除",
        )),
    }
}

/// POST /api/v1/admin/afdian/sync —— 拉取并覆盖快照
pub async fn sync_afdian(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let s = settings::load(&st.pool, &st.cfg).await;
    let user_id = settings::text(&s, "afdianUserId");
    let token = settings::text(&s, "afdianToken");

    if user_id.is_empty() || token.is_empty() {
        return Err(ApiError::with_message(
            StatusCode::BAD_REQUEST,
            "afdian_not_configured",
            "未配置爱发电 user_id / token（可在后台「站点设置」填写）",
        ));
    }

    let (list, total) = afdian::fetch_sponsors(&st.http, &user_id, &token, 10)
        .await
        .map_err(|e| {
            ApiError::with_message(StatusCode::BAD_GATEWAY, "afdian_error", e.to_string())
        })?;

    let (count, sum) = sponsors::replace_from_afdian(&st.pool, &list)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "count": count,
        "total": sum,
        "totalCount": total,
    }))
    .into_response())
}

/* ── 徽章分配与概览 ─────────────────────── */

/// PATCH /api/v1/admin/users/{id}/badges  body: { badges: string[] }
pub async fn patch_user_badges(
    State(st): State<AppState>,
    _: AdminActor,
    axum::extract::Path(id): axum::extract::Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(p) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let badges: Vec<String> = p
        .get("badges")
        .and_then(|v| v.as_array())
        .map(|arr| {
            let mut seen = std::collections::HashSet::new();
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty() && seen.insert(s.to_string()))
                .take(12)
                .map(str::to_string)
                .collect()
        })
        .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "invalid_body"))?;

    let affected = sqlx::query("UPDATE users SET badges = $2 WHERE id = $1")
        .bind(&id)
        .bind(serde_json::json!(badges))
        .execute(&st.pool)
        .await
        .map_err(ApiError::internal)?
        .rows_affected();

    if affected == 0 {
        return Err(ApiError::not_found());
    }

    let user = users::find_by_id(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .map(|r| r.to_public())
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "user": user })).into_response())
}
