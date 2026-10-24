//! 身份组管理接口。
//!
//! 组本身不涉及敏感密钥，但「谁能改组」必须收紧：一律走 `AdminActor`（role=admin 或 ADMIN_TOKEN）。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::groups::{self, GroupError, GroupPatch, NewGroup};
use crate::state::AppState;
use crate::{agreements, users};

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

fn strings(obj: &Map<String, Value>, key: &str) -> Option<Vec<String>> {
    obj.get(key).and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|x| x.as_str())
            .map(|x| x.trim().to_string())
            .filter(|x| !x.is_empty())
            .collect()
    })
}

fn group_err(e: GroupError) -> ApiError {
    match e {
        GroupError::NotFound => ApiError::not_found(),
        GroupError::SlugTaken => {
            ApiError::with_message(StatusCode::CONFLICT, "slug_taken", "该标识已被使用")
        }
        GroupError::Builtin => {
            ApiError::with_message(StatusCode::CONFLICT, "builtin_group", "内置身份组不能删除")
        }
        GroupError::Invalid(msg) => ApiError::invalid_input(msg),
        GroupError::Db(err) => ApiError::internal(err),
    }
}

/// GET /api/v1/admin/groups —— 列表 + 可勾选的权限点 + 现有公约（前端要用来做多选）
pub async fn list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = groups::list(&st.pool).await.map_err(ApiError::internal)?;
    let agreements = agreements::list_active(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "items": items,
        "permissions": groups::PERMISSIONS
            .iter()
            .map(|(k, label)| json!({ "key": k, "label": label }))
            .collect::<Vec<_>>(),
        "agreements": agreements
            .iter()
            .map(|a| json!({ "id": a.id, "title": a.title }))
            .collect::<Vec<_>>(),
    }))
    .into_response())
}

/// POST /api/v1/admin/groups
pub async fn create(State(st): State<AppState>, _: AdminActor, body: Bytes) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let group = groups::create(
        &st.pool,
        NewGroup {
            name: &text(&obj, "name"),
            slug: &text(&obj, "slug"),
            color: &text(&obj, "color"),
            weight: obj.get("weight").and_then(|v| v.as_i64()).unwrap_or(10) as i32,
            is_default: obj
                .get("isDefault")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            permissions: strings(&obj, "permissions").unwrap_or_default(),
            required_agreements: strings(&obj, "requiredAgreements").unwrap_or_default(),
        },
    )
    .await
    .map_err(group_err)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "group": group })),
    )
        .into_response())
}

/// PATCH /api/v1/admin/groups/{id}
pub async fn patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let group = groups::update(
        &st.pool,
        &id,
        GroupPatch {
            name: obj.get("name").and_then(|v| v.as_str()).map(str::to_string),
            color: obj
                .get("color")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            weight: obj.get("weight").and_then(|v| v.as_i64()).map(|v| v as i32),
            is_default: obj.get("isDefault").and_then(|v| v.as_bool()),
            permissions: strings(&obj, "permissions"),
            required_agreements: strings(&obj, "requiredAgreements"),
        },
    )
    .await
    .map_err(group_err)?;

    Ok(Json(json!({ "ok": true, "group": group })).into_response())
}

/// DELETE /api/v1/admin/groups/{id}
pub async fn remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    groups::delete(&st.pool, &id).await.map_err(group_err)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/// PATCH /api/v1/admin/users/{id}/group  body: { groupId: string | null }
pub async fn assign(
    State(st): State<AppState>,
    _: AdminActor,
    Path(user_id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    if !obj.contains_key("groupId") {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_body"));
    }

    let group_id = obj.get("groupId").and_then(|v| v.as_str());
    if let Some(gid) = group_id {
        if groups::get(&st.pool, gid)
            .await
            .map_err(ApiError::internal)?
            .is_none()
        {
            return Err(ApiError::not_found());
        }
    }

    let exists = users::find_by_id(&st.pool, &user_id)
        .await
        .map_err(ApiError::internal)?;
    if exists.is_none() {
        return Err(ApiError::not_found());
    }

    groups::assign_user(&st.pool, &user_id, group_id)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/groups —— 公开列表：只给展示需要的字段，不含权限与公约要求
pub async fn public_list(State(st): State<AppState>) -> ApiResult<Response> {
    let items: Vec<Value> = groups::list(&st.pool)
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(|g| {
            json!({
                "id": g.id,
                "name": g.name,
                "slug": g.slug,
                "color": g.color,
                "weight": g.weight,
                "memberCount": g.member_count,
            })
        })
        .collect();

    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}
