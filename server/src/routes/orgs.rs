//! 公会 / 战队接口。
//!
//! 两条线刻意分开：`/api/v1/guilds` 与 `/api/v1/teams` 是**两个独立资源**，
//! 没有嵌套、没有「公会下的战队」。共用的是实现，不是语义。
//! 榜单也分开算：`/api/v1/leaderboard` 只是把两张榜装进同一个响应，方便排行榜页一次取完。

use std::collections::HashMap;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::orgs::{self, Kind, OrgError, OrgInput, OrgPatch, OrgView, StatPatch};
use crate::state::AppState;
use crate::users::PublicUser;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()?
        .as_object()
        .cloned()
}

fn text(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn need_login() -> ApiError {
    ApiError::with_message(StatusCode::FORBIDDEN, "need_login", "请先登录")
}

fn org_err(e: OrgError) -> ApiError {
    match e {
        OrgError::NotFound => ApiError::not_found(),
        OrgError::Duplicate(msg) => {
            ApiError::with_message(StatusCode::CONFLICT, "duplicate_org", msg)
        }
        OrgError::Invalid(msg) => ApiError::invalid_input(msg),
        OrgError::Db(err) => ApiError::internal(err),
    }
}

fn game_filter(q: &HashMap<String, String>) -> Option<String> {
    q.get("game")
        .map(|g| g.trim().to_lowercase())
        .filter(|g| !g.is_empty())
}

fn check_game(game: &Option<String>) -> ApiResult<()> {
    if let Some(g) = game {
        if !orgs::GAMES.contains(&g.as_str()) {
            return Err(ApiError::invalid_input(
                "游戏只能是 minecraft / rusted_warfare",
            ));
        }
    }
    Ok(())
}

fn require_owner_or_admin(user: &PublicUser, org: &OrgView) -> ApiResult<()> {
    if user.is_admin || org.owner_id.as_deref() == Some(user.id.as_str()) {
        Ok(())
    } else {
        Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "no_permission",
            "只有负责人或管理员能改这个条目",
        ))
    }
}

/* ── 列表 / 详情 ─────────────────────────── */

async fn list_impl(
    st: &AppState,
    kind: Kind,
    q: &HashMap<String, String>,
) -> ApiResult<Response> {
    let game = game_filter(q);
    check_game(&game)?;
    let items = orgs::list(&st.pool, kind, game.as_deref())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

pub async fn list_guilds(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    list_impl(&st, Kind::Guild, &q).await
}

pub async fn list_teams(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    list_impl(&st, Kind::Team, &q).await
}

async fn detail_impl(st: &AppState, kind: Kind, id: &str) -> ApiResult<Response> {
    let item = orgs::get(&st.pool, kind, id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

pub async fn guild(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    detail_impl(&st, Kind::Guild, &id).await
}

pub async fn team(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    detail_impl(&st, Kind::Team, &id).await
}

/* ── 创建 / 修改 / 删除 ──────────────────── */

async fn create_impl(
    st: &AppState,
    kind: Kind,
    maybe: MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.0.ok_or_else(need_login)?;
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let mut input = OrgInput {
        name: text(&obj, "name"),
        tag: text(&obj, "tag"),
        game: text(&obj, "game"),
        intro: text(&obj, "intro"),
    };
    orgs::validate(&mut input).map_err(ApiError::invalid_input)?;

    let item = orgs::create(&st.pool, kind, &user.id, &input)
        .await
        .map_err(org_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

pub async fn create_guild(
    State(st): State<AppState>,
    maybe: MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    create_impl(&st, Kind::Guild, maybe, body).await
}

pub async fn create_team(
    State(st): State<AppState>,
    maybe: MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    create_impl(&st, Kind::Team, maybe, body).await
}

async fn patch_impl(
    st: &AppState,
    kind: Kind,
    maybe: MaybeUser,
    id: &str,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.0.ok_or_else(need_login)?;
    let current = orgs::get(&st.pool, kind, id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    require_owner_or_admin(&user, &current)?;

    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    // 用「现有值 + 改动」整份再校验一次，规则只写一遍
    let mut merged = OrgInput {
        name: obj
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.name.clone()),
        tag: obj
            .get("tag")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.tag.clone()),
        // 游戏所属创建后不可改：换了游戏，历史战绩的意义就没了
        game: current.game.clone(),
        intro: obj
            .get("intro")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.intro.clone()),
    };
    orgs::validate(&mut merged).map_err(ApiError::invalid_input)?;

    let status = match obj.get("status").and_then(Value::as_str) {
        Some(s) => {
            let s = s.trim().to_string();
            orgs::validate_status(&s).map_err(ApiError::invalid_input)?;
            Some(s)
        }
        None => None,
    };

    let patch = OrgPatch {
        name: obj.get("name").map(|_| merged.name.clone()),
        tag: obj.get("tag").map(|_| merged.tag.clone()),
        intro: obj.get("intro").map(|_| merged.intro.clone()),
        status,
    };
    let item = orgs::update(&st.pool, kind, id, &patch)
        .await
        .map_err(org_err)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

pub async fn patch_guild(
    State(st): State<AppState>,
    maybe: MaybeUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    patch_impl(&st, Kind::Guild, maybe, &id, body).await
}

pub async fn patch_team(
    State(st): State<AppState>,
    maybe: MaybeUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    patch_impl(&st, Kind::Team, maybe, &id, body).await
}

async fn delete_impl(st: &AppState, kind: Kind, maybe: MaybeUser, id: &str) -> ApiResult<Response> {
    let user = maybe.0.ok_or_else(need_login)?;
    let current = orgs::get(&st.pool, kind, id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    require_owner_or_admin(&user, &current)?;

    orgs::delete(&st.pool, kind, id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

pub async fn delete_guild(
    State(st): State<AppState>,
    maybe: MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    delete_impl(&st, Kind::Guild, maybe, &id).await
}

pub async fn delete_team(
    State(st): State<AppState>,
    maybe: MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    delete_impl(&st, Kind::Team, maybe, &id).await
}

/* ── 榜单 ───────────────────────────────── */

/// GET /api/v1/leaderboard?game=
///
/// 两张榜**分开返回**：前端不需要知道它们之间的关系，因为它们之间没有关系。
pub async fn leaderboard(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let game = game_filter(&q);
    check_game(&game)?;

    let (guilds, teams) = tokio::join!(
        orgs::list(&st.pool, Kind::Guild, game.as_deref()),
        orgs::list(&st.pool, Kind::Team, game.as_deref()),
    );
    let guilds = guilds.map_err(ApiError::internal)?;
    let teams = teams.map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "game": game,
        "guilds": guilds,
        "teams": teams,
    }))
    .into_response())
}

/* ── 后台 ───────────────────────────────── */

fn kind_path(raw: &str) -> ApiResult<Kind> {
    Kind::parse(raw).ok_or_else(|| ApiError::invalid_input("类型只能是 guild 或 team"))
}

/// GET /api/v1/admin/orgs —— 两张榜一起给，后台一页看完
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let (guilds, teams) = tokio::join!(
        orgs::list(&st.pool, Kind::Guild, None),
        orgs::list(&st.pool, Kind::Team, None),
    );
    Ok(Json(json!({
        "ok": true,
        "guilds": guilds.map_err(ApiError::internal)?,
        "teams": teams.map_err(ApiError::internal)?,
    }))
    .into_response())
}

/// PATCH /api/v1/admin/orgs/{kind}/{id}  body: { points, wins, losses, members, status }
///
/// 仲裁确认比赛后由后台校准；这是榜单唯一的写入口。
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path((kind_raw, id)): Path<(String, String)>,
    body: Bytes,
) -> ApiResult<Response> {
    let kind = kind_path(&kind_raw)?;
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let num = |key: &str| obj.get(key).and_then(Value::as_i64);
    let patch = StatPatch {
        points: num("points"),
        wins: num("wins"),
        losses: num("losses"),
        members: num("members"),
    };

    if let Some(status) = obj.get("status").and_then(Value::as_str) {
        let status = status.trim();
        orgs::validate_status(status).map_err(ApiError::invalid_input)?;
        let p = OrgPatch {
            status: Some(status.to_string()),
            ..Default::default()
        };
        orgs::update(&st.pool, kind, &id, &p)
            .await
            .map_err(org_err)?;
    }

    let item = orgs::set_stats(&st.pool, kind, &id, &patch)
        .await
        .map_err(org_err)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/orgs/{kind}/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path((kind_raw, id)): Path<(String, String)>,
) -> ApiResult<Response> {
    let kind = kind_path(&kind_raw)?;
    if !orgs::delete(&st.pool, kind, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
