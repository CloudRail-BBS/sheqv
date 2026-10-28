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

/// 身份组外观：与前端 `.gtag[data-gs=…]` 对应
pub const GROUP_STYLES: [&str; 4] = ["soft", "solid", "outline", "glow"];

fn style_or(obj: &serde_json::Map<String, serde_json::Value>, fallback: &str) -> String {
    let raw = obj
        .get("style")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if GROUP_STYLES.contains(&raw.as_str()) {
        raw
    } else {
        fallback.to_string()
    }
}
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
            style: &style_or(&obj, "soft"),
            effect: &text(&obj, "effect"),
            description: &text(&obj, "description"),
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
            style: obj.get("style").and_then(|v| v.as_str()).map(str::to_string),
            effect: obj
                .get("effect")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            description: obj
                .get("description")
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

/// GET /api/v1/groups —— 公开列表。
///
/// 身份组是「社区里看得见的东西」，所以给描述、成员数、能力标签与进组条件；
/// 权限键不直接下发（那是实现细节），翻译成人话再给。
pub async fn public_list(State(st): State<AppState>) -> ApiResult<Response> {
    let agreements = agreements::list_active(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let label = |key: &str| {
        groups::PERMISSIONS
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, v)| (*v).to_string())
            .unwrap_or_else(|| key.to_string())
    };

    let items: Vec<Value> = groups::list(&st.pool)
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(|g| {
            let capabilities: Vec<String> = g.permissions.iter().map(|p| label(p)).collect();
            let must_sign: Vec<String> = g
                .required_agreements
                .iter()
                .map(|id| {
                    agreements
                        .iter()
                        .find(|a| &a.id == id)
                        .map(|a| a.title.clone())
                        .unwrap_or_else(|| id.clone())
                })
                .collect();
            json!({
                "id": g.id,
                "name": g.name,
                "slug": g.slug,
                "color": g.color,
                "style": g.style,
                "effect": g.effect,
                "description": g.description,
                "weight": g.weight,
                "isDefault": g.is_default,
                "memberCount": g.member_count,
                "capabilities": capabilities,
                "requiredAgreements": must_sign,
            })
        })
        .collect();

    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}
