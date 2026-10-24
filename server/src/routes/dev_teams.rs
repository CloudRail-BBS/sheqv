//! 开发团队接口。
//!
//! 创建 / 加人 / 移除都只认同一个人：团队负责人（管理员兜底）。
//! 成员必须是开发者——团队不是绕开开发者身份的通道。

use std::collections::HashMap;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::{CurrentUser, MaybeUser};
use crate::dev_teams::{self, NewDevTeam, TeamError, TeamPatch};
use crate::errors::{ApiError, ApiResult};
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

fn team_err(e: TeamError) -> ApiError {
    match e {
        TeamError::NotFound => ApiError::not_found(),
        TeamError::UserNotFound => {
            ApiError::with_message(StatusCode::NOT_FOUND, "user_not_found", "找不到这个用户")
        }
        TeamError::NameTaken => {
            ApiError::with_message(StatusCode::CONFLICT, "name_taken", "团队名已被占用")
        }
        TeamError::TagTaken => {
            ApiError::with_message(StatusCode::CONFLICT, "tag_taken", "简称已被占用")
        }
        TeamError::NotDeveloper => {
            ApiError::with_message(StatusCode::FORBIDDEN, "not_developer", "先发布一个资源，成为开发者后才能建队")
        }
        TeamError::AlreadyOwned => {
            ApiError::with_message(StatusCode::CONFLICT, "already_owned", "一个账号只能负责一个开发团队")
        }
        TeamError::AlreadyMember => {
            ApiError::with_message(StatusCode::CONFLICT, "already_member", "这个人已经在团队里了")
        }
        TeamError::MemberLimit => {
            ApiError::with_message(StatusCode::CONFLICT, "member_limit", "团队最多 20 人")
        }
        TeamError::Invalid(msg) => ApiError::invalid_input(msg),
        TeamError::Db(err) => ApiError::internal(err),
    }
}

/// GET /api/v1/dev-teams?q=
pub async fn list(
    State(st): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let q = params.get("q").map(String::as_str).filter(|s| !s.is_empty());
    let items = dev_teams::list(&st.pool, q)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/dev-teams/{id}
pub async fn detail(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let team = dev_teams::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": team })).into_response())
}

/// GET /api/v1/me/dev-teams
pub async fn mine(State(st): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    let items = dev_teams::list_for_user(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/dev-teams
pub async fn create(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let input = NewDevTeam {
        name: &text(&obj, "name"),
        tag: &text(&obj, "tag"),
        description: &text(&obj, "description"),
        color: &text(&obj, "color"),
        game: &text(&obj, "game"),
    };

    let id = dev_teams::create(&st.pool, &user.id, &input)
        .await
        .map_err(team_err)?;

    let team = dev_teams::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::internal("团队读取失败"))?;

    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": team }))).into_response())
}

async fn load_for_owner(
    st: &AppState,
    user: &crate::users::PublicUser,
    id: &str,
) -> ApiResult<dev_teams::DevTeamView> {
    let team = dev_teams::get(&st.pool, id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    if team.owner_id != user.id && !user.is_admin {
        return Err(ApiError::with_message(StatusCode::FORBIDDEN, "forbidden", "只有团队负责人或管理员能操作"));
    }
    Ok(team)
}

/// PATCH /api/v1/dev-teams/{id}
pub async fn patch(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let current = load_for_owner(&st, &user, &id).await?;
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let name = obj.get("name").and_then(|v| v.as_str());
    let tag = obj.get("tag").and_then(|v| v.as_str());
    let description = obj.get("description").and_then(|v| v.as_str());
    let color = obj.get("color").and_then(|v| v.as_str());
    let game = obj.get("game").and_then(|v| v.as_str());

    let item = dev_teams::patch(
        &st.pool,
        &id,
        TeamPatch {
            name,
            tag,
            description,
            color,
            game,
        },
    )
    .await
    .map_err(team_err)?
    .unwrap_or(current);

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/dev-teams/{id}
pub async fn remove(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    load_for_owner(&st, &user, &id).await?;
    dev_teams::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/// POST /api/v1/dev-teams/{id}/members  body: { nickname }
pub async fn add_member(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    load_for_owner(&st, &user, &id).await?;
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let nickname = text(&obj, "nickname");
    if nickname.is_empty() {
        return Err(ApiError::invalid_input("请输入昵称"));
    }
    dev_teams::add_member(&st.pool, &id, &nickname)
        .await
        .map_err(team_err)?;

    let team = dev_teams::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": team })).into_response())
}

/// DELETE /api/v1/dev-teams/{id}/members/{userId}
pub async fn remove_member(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path((id, user_id)): Path<(String, String)>,
) -> ApiResult<Response> {
    load_for_owner(&st, &user, &id).await?;
    dev_teams::remove_member(&st.pool, &id, &user_id)
        .await
        .map_err(team_err)?;

    let team = dev_teams::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": team })).into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/dev-teams
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = dev_teams::list(&st.pool, None)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// DELETE /api/v1/admin/dev-teams/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let done = dev_teams::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/dev-teams/{id}/resources —— 团队详情页的作品列表
pub async fn team_resources(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let viewer = maybe.map(|u| u.id).unwrap_or_default();
    let items = crate::resources::list_by_team(&st.pool, &viewer, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}
