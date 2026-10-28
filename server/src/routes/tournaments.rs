//! 赛事接口：公开列表 / 详情 / 报名，后台增删改与报名审核。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::{CurrentUser, MaybeUser};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::tournaments::{self, SignupInput, TournamentInput, TournamentPatch};

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()?
        .as_object()
        .cloned()
}

fn text(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn num(obj: &Map<String, Value>, key: &str) -> i64 {
    obj.get(key).and_then(Value::as_i64).unwrap_or(0)
}

/// 时间字段：缺省 / null / 空串都算「不设置」，字符串按 ISO 8601 解析。
/// 返回 None 表示请求里没这个键（PATCH 时保持原值）。
fn dt_field(obj: &Map<String, Value>, key: &str) -> Result<Option<Option<DateTime<Utc>>>, ApiError> {
    match obj.get(key) {
        None => Ok(None),
        Some(Value::Null) => Ok(Some(None)),
        Some(Value::String(s)) if s.trim().is_empty() => Ok(Some(None)),
        Some(Value::String(s)) => {
            let parsed = DateTime::parse_from_rfc3339(s.trim())
                .map(|d| d.with_timezone(&Utc))
                .or_else(|_| {
                    chrono::NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%dT%H:%M")
                        .map(|d| d.and_utc())
                })
                .map_err(|_| ApiError::invalid_input(format!("{key} 不是合法时间")))?;
            Ok(Some(Some(parsed)))
        }
        _ => Err(ApiError::invalid_input(format!("{key} 不是合法时间"))),
    }
}

fn map_err(e: tournaments::TournamentError) -> ApiError {
    match e {
        tournaments::TournamentError::NotFound => ApiError::not_found(),
        tournaments::TournamentError::Already => ApiError::with_message(
            StatusCode::CONFLICT,
            "already_signed",
            "你已经报名了这场赛事",
        ),
        tournaments::TournamentError::Invalid(msg) => ApiError::invalid_input(msg),
        tournaments::TournamentError::Db(err) => ApiError::internal(err),
    }
}

/* ── 公开 ───────────────────────────────── */

/// GET /api/v1/tournaments
pub async fn list(State(st): State<AppState>) -> ApiResult<Response> {
    let items = tournaments::list(&st.pool, false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/tournaments/{id}
pub async fn detail(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let viewer = maybe.as_ref().map(|u| u.id.as_str()).unwrap_or("");
    let Some(detail) = tournaments::detail(&st.pool, &id, viewer)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if detail.tournament.status == "draft" && !maybe.as_ref().is_some_and(|u| u.is_admin) {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({
        "ok": true,
        "item": detail.tournament,
        "entries": detail.entries,
        "myEntry": detail.my_entry,
    }))
    .into_response())
}

/// POST /api/v1/tournaments/{id}/signup
pub async fn signup(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let input = SignupInput {
        team_name: &text(&obj, "teamName"),
        contact: &text(&obj, "contact"),
        note: &text(&obj, "note"),
    };
    if let Some(msg) = tournaments::validate_signup(&input) {
        return Err(ApiError::invalid_input(msg));
    }
    let entry = tournaments::signup(&st.pool, &id, &user.id, &input)
        .await
        .map_err(map_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "entry": entry }))).into_response())
}

/// DELETE /api/v1/tournaments/{id}/signup
pub async fn cancel(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let existed = tournaments::cancel(&st.pool, &id, &user.id)
        .await
        .map_err(ApiError::internal)?;
    if !existed {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/tournaments
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = tournaments::admin_list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/tournaments
pub async fn admin_create(
    State(st): State<AppState>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let title = text(&obj, "title");
    let game = text(&obj, "game");
    let mode = text(&obj, "mode");
    let summary = text(&obj, "summary");
    let body_text = text(&obj, "body");
    let cover = text(&obj, "cover");
    let prize = text(&obj, "prize");
    let host_name = text(&obj, "hostName");
    let raw_status = text(&obj, "status");
    let status = if raw_status.is_empty() {
        "draft".to_string()
    } else {
        raw_status
    };
    let signup_start = dt_field(&obj, "signupStart")?.flatten();
    let signup_end = dt_field(&obj, "signupEnd")?.flatten();
    let start_at = dt_field(&obj, "startAt")?.flatten();
    let end_at = dt_field(&obj, "endAt")?.flatten();
    let max_entries = num(&obj, "maxEntries").max(0);

    let input = TournamentInput {
        title: &title,
        game: &game,
        mode: &mode,
        summary: &summary,
        body: &body_text,
        cover: &cover,
        prize: &prize,
        host_name: &host_name,
        status: &status,
        signup_start,
        signup_end,
        start_at,
        end_at,
        max_entries,
    };
    if let Some(msg) = tournaments::validate(&input) {
        return Err(ApiError::invalid_input(msg));
    }
    let id = tournaments::create(&st.pool, &input, actor.user_id())
        .await
        .map_err(ApiError::internal)?;
    let detail = tournaments::detail(&st.pool, &id, "")
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::internal("赛事读取失败"))?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": detail.tournament }))).into_response())
}

/// PATCH /api/v1/admin/tournaments/{id}
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(cur) = tournaments::detail(&st.pool, &id, "")
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let pick = |key: &str, fallback: &str| {
        obj.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or(fallback)
            .to_string()
    };
    let title = pick("title", &cur.tournament.title);
    let game = pick("game", &cur.tournament.game);
    let mode = pick("mode", &cur.tournament.mode);
    let summary = pick("summary", &cur.tournament.summary);
    let body_text = pick("body", cur.tournament.body.as_deref().unwrap_or(""));
    let cover = pick("cover", &cur.tournament.cover);
    let prize = pick("prize", &cur.tournament.prize);
    let host_name = pick("hostName", &cur.tournament.host_name);
    let status = pick("status", &cur.tournament.status);
    let max_entries = obj
        .get("maxEntries")
        .and_then(Value::as_i64)
        .unwrap_or(cur.tournament.max_entries);

    let signup_start = dt_field(&obj, "signupStart")?;
    let signup_end = dt_field(&obj, "signupEnd")?;
    let start_at = dt_field(&obj, "startAt")?;
    let end_at = dt_field(&obj, "endAt")?;

    // 主办账号：缺省 = 不动；null/空串 = 清空；字符串 = 换人（不存在的 id 会被子查询落成 NULL）
    let host_user_id = match obj.get("hostUserId") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(s)) if s.trim().is_empty() => Some(None),
        Some(Value::String(s)) => Some(Some(s.trim().to_string())),
        _ => return Err(ApiError::invalid_input("hostUserId 不合法")),
    };

    let check = TournamentInput {
        title: &title,
        game: &game,
        mode: &mode,
        summary: &summary,
        body: &body_text,
        cover: &cover,
        prize: &prize,
        host_name: &host_name,
        status: &status,
        signup_start: signup_start.flatten(),
        signup_end: signup_end.flatten(),
        start_at: start_at.flatten(),
        end_at: end_at.flatten(),
        max_entries,
    };
    if let Some(msg) = tournaments::validate(&check) {
        return Err(ApiError::invalid_input(msg));
    }

    tournaments::patch(
        &st.pool,
        &id,
        &TournamentPatch {
            title: Some(&title),
            host_name: Some(&host_name),
            game: Some(&game),
            mode: Some(&mode),
            summary: Some(&summary),
            body: Some(&body_text),
            cover: Some(&cover),
            prize: Some(&prize),
            status: Some(&status),
            signup_start,
            signup_end,
            start_at,
            end_at,
            max_entries: Some(max_entries),
            host_user_id: host_user_id.as_ref().map(|v| v.as_deref()),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    let detail = tournaments::detail(&st.pool, &id, "")
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found())?;
    Ok(Json(json!({ "ok": true, "item": detail.tournament })).into_response())
}

/// DELETE /api/v1/admin/tournaments/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !tournaments::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/admin/tournaments/{id}/entries
pub async fn admin_entries(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let items = tournaments::admin_entries(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// PATCH /api/v1/admin/tournaments/entries/{entryId}
pub async fn admin_review(
    State(st): State<AppState>,
    _: AdminActor,
    Path(entry_id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let status = text(&obj, "status");
    if !["pending", "approved", "rejected"].contains(&status.as_str()) {
        return Err(ApiError::invalid_input("状态不合法"));
    }
    if !tournaments::review_entry(&st.pool, &entry_id, &status)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
