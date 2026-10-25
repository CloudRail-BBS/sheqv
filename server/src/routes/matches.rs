//! 约战：列表 / 详情 / 发起 / 接受。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde_json::{Map, Value, json};

use crate::agreements;
use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::matches::{self, NewMatch};
use crate::orgs::{self, Kind};
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

fn text(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// GET /api/v1/matches[?status=pending_accept]
pub async fn list(
    State(st): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Response> {
    let status = q.get("status").map(String::as_str).filter(|s| !s.is_empty());
    if let Some(s) = status {
        if !matches!(
            s,
            "pending_accept" | "locked" | "declined" | "submitted" | "disputed" | "confirmed"
        ) {
            return Err(ApiError::invalid_input("状态不正确"));
        }
    }
    let items = matches::list(&st.pool, status)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// GET /api/v1/matches/{id}
pub async fn get(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let Some(item) = matches::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// POST /api/v1/matches —— 需登录 + 诚信公约 + 自己是对应组织负责人
pub async fn create(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(payload) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let Some(trust) = agreements::get(&st.pool, "trust")
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "trust_missing",
            "诚信公约未配置",
        ));
    };
    if !agreements::is_signed(&st.pool, &user.id, "trust", &trust.version).await {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "need_trust",
            "发起约战前需要先签署《诚信公约》",
        ));
    }

    let creator_kind = Kind::parse(&text(&payload, "creatorKind"))
        .ok_or_else(|| ApiError::invalid_input("请选择自己的公会或战队"))?;
    let creator_org_id = text(&payload, "creatorOrgId");
    let opponent_kind = Kind::parse(&text(&payload, "opponentKind"))
        .ok_or_else(|| ApiError::invalid_input("请选择对手的公会或战队"))?;
    let opponent_org_id = text(&payload, "opponentOrgId");
    if creator_org_id.is_empty() || opponent_org_id.is_empty() {
        return Err(ApiError::invalid_input("请选择双方组织"));
    }
    if creator_kind == opponent_kind && creator_org_id == opponent_org_id {
        return Err(ApiError::invalid_input("不能和自己约战"));
    }

    let Some(creator) = orgs::get(&st.pool, creator_kind, &creator_org_id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::invalid_input("自己的公会/战队不存在"));
    };
    if creator.owner_id.as_deref() != Some(user.id.as_str()) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "not_owner",
            "只有负责人可以代表公会/战队发起约战",
        ));
    }
    let Some(opponent) = orgs::get(&st.pool, opponent_kind, &opponent_org_id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::invalid_input("对手的公会/战队不存在"));
    };
    if creator.game != opponent.game {
        return Err(ApiError::invalid_input("双方的游戏所属必须一致"));
    }
    if opponent.owner_id.as_deref() == Some(user.id.as_str()) {
        return Err(ApiError::invalid_input("不能约战自己名下的另一个组织"));
    }

    let format = text(&payload, "format");
    if format.is_empty() || format.chars().count() > 20 {
        return Err(ApiError::invalid_input("请选择赛制"));
    }
    let scheduled_raw = text(&payload, "scheduledAt");
    let scheduled_at = DateTime::parse_from_rfc3339(&scheduled_raw)
        .map(|t| t.with_timezone(&Utc))
        .or_else(|_| {
            DateTime::parse_from_str(&scheduled_raw, "%Y-%m-%dT%H:%M")
                .map(|t| t.with_timezone(&Utc))
        })
        .map_err(|_| ApiError::invalid_input("开赛时间格式不正确"))?;

    let title_raw = text(&payload, "title");
    let title = if title_raw.is_empty() {
        format!("{} vs {}", creator.name, opponent.name)
    } else {
        title_raw
    };
    if title.chars().count() < 4 || title.chars().count() > 60 {
        return Err(ApiError::invalid_input("标题需为 4–60 字"));
    }
    let note = text(&payload, "note");
    if note.chars().count() > 500 {
        return Err(ApiError::invalid_input("备注不超过 500 字"));
    }
    let maps: Vec<String> = payload
        .get("maps")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .take(5)
                .collect()
        })
        .unwrap_or_default();

    let item = matches::create(
        &st.pool,
        &NewMatch {
            title,
            game: creator.game.clone(),
            format,
            maps,
            scheduled_at,
            note,
            creator_id: user.id.clone(),
            creator_kind: creator_kind.as_str().to_string(),
            creator_org_id: creator.id.clone(),
            creator_name: creator.name.clone(),
            creator_tag: creator.tag.clone(),
            opponent_kind: opponent_kind.as_str().to_string(),
            opponent_org_id: opponent.id.clone(),
            opponent_name: opponent.name.clone(),
            opponent_tag: opponent.tag.clone(),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

/// POST /api/v1/matches/{id}/accept —— 对手负责人接受，状态转 locked
pub async fn accept(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let Some(trust) = agreements::get(&st.pool, "trust")
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "trust_missing",
            "诚信公约未配置",
        ));
    };
    if !agreements::is_signed(&st.pool, &user.id, "trust", &trust.version).await {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "need_trust",
            "接受约战前需要先签署《诚信公约》",
        ));
    }

    let Some(item) = matches::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if item.status != "pending_accept" {
        return Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "not_pending",
            "这场约战已经处理过了",
        ));
    }
    let Some(kind) = Kind::parse(&item.opponent_kind) else {
        return Err(ApiError::invalid_input("约战数据不完整"));
    };
    let Some(opponent) = orgs::get(&st.pool, kind, &item.opponent_org_id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::invalid_input("对方组织不存在"));
    };
    if opponent.owner_id.as_deref() != Some(user.id.as_str()) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "not_invited",
            "只有被约战方的负责人可以接受",
        ));
    }

    let updated = matches::accept(&st.pool, &id, &user.id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": updated })).into_response())
}
