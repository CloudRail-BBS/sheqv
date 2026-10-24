//! 福利中心：礼品卡 / 兑换码 / 抽奖。
//!
//! 用户侧全部要求登录；后台发卡与奖池走 `AdminActor`。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::rewards::{self, NewCard, PrizeInput, RewardError};
use crate::state::AppState;
use crate::users;

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

fn number(obj: &Map<String, Value>, key: &str) -> i64 {
    obj.get(key).and_then(|v| v.as_i64()).unwrap_or(0)
}

fn reward_err(e: RewardError) -> ApiError {
    match e {
        RewardError::NotFound => {
            ApiError::with_message(StatusCode::NOT_FOUND, "not_found", "卡不存在，或不是发给你的")
        }
        RewardError::Used => {
            ApiError::with_message(StatusCode::CONFLICT, "used", "这张卡已经被用掉了")
        }
        RewardError::Expired => {
            ApiError::with_message(StatusCode::CONFLICT, "expired", "这张卡已经过期")
        }
        RewardError::Insufficient => {
            ApiError::with_message(StatusCode::CONFLICT, "insufficient", "积分不足，先签到或发帖攒一点")
        }
        RewardError::NoPrize => {
            ApiError::with_message(StatusCode::CONFLICT, "no_prize", "奖池暂时空了，晚点再来")
        }
        RewardError::Invalid(msg) => ApiError::invalid_input(msg),
        RewardError::Db(err) => ApiError::internal(err),
    }
}

/// GET /api/v1/rewards —— 我的卡、历史、奖池、抽奖记录、余额
pub async fn snapshot(State(st): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    let mine = rewards::mine(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    let mut prizes = rewards::prizes(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    prizes.retain(|p| p.enabled);
    let draws = rewards::my_draws(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    let points: i32 = sqlx::query_scalar("SELECT points FROM users WHERE id = $1")
        .bind(&user.id)
        .fetch_one(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "cards": mine.cards,
        "history": mine.history,
        "prizes": prizes,
        "draws": draws,
        "points": points as i64,
        "cost": rewards::LOTTERY_COST,
    }))
    .into_response())
}

/// POST /api/v1/rewards/cards/{id}/open
pub async fn open(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let opened = rewards::open(&st.pool, &user.id, &id)
        .await
        .map_err(reward_err)?;
    Ok(Json(json!({
        "ok": true,
        "title": opened.title,
        "points": opened.points,
        "rewardKind": opened.reward_kind,
        "rewardValue": opened.reward_value,
        "balance": opened.balance,
    }))
    .into_response())
}

/// POST /api/v1/rewards/redeem  body: { code }
pub async fn redeem(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let code = text(&obj, "code");
    let opened = rewards::redeem(&st.pool, &user.id, &code)
        .await
        .map_err(reward_err)?;
    Ok(Json(json!({
        "ok": true,
        "title": opened.title,
        "points": opened.points,
        "rewardKind": opened.reward_kind,
        "rewardValue": opened.reward_value,
        "balance": opened.balance,
    }))
    .into_response())
}

/// POST /api/v1/rewards/lottery
pub async fn draw(State(st): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    let result = rewards::draw(&st.pool, &user.id)
        .await
        .map_err(reward_err)?;
    Ok(Json(json!({
        "ok": true,
        "prize": {
            "name": result.prize_name,
            "kind": result.kind,
            "points": result.points,
            "theme": result.theme,
        },
        "giftPoints": result.gift_points,
        "cardId": result.card_id,
        "balance": result.balance,
        "cost": rewards::LOTTERY_COST,
    }))
    .into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/rewards/cards
pub async fn admin_cards(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = rewards::admin_list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/rewards/cards
pub async fn admin_create_card(
    State(st): State<AppState>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let kind = text(&obj, "kind");
    let assigned = if kind == "gift" {
        let nickname = text(&obj, "nickname");
        if nickname.is_empty() {
            return Err(ApiError::invalid_input("请填写收件人昵称"));
        }
        // 昵称优先；@ 开头按用户名找。两者都试，避免「明明在列表里却查不到」。
        let raw = nickname.trim_start_matches('@');
        let by_name = users::find_by_nickname(&st.pool, raw)
            .await
            .map_err(ApiError::internal)?;
        let target = match by_name {
            Some(u) => Some(u),
            None => users::find_by_username(&st.pool, raw)
                .await
                .map_err(ApiError::internal)?,
        };
        let Some(target) = target else {
            return Err(ApiError::with_message(
                StatusCode::NOT_FOUND,
                "user_not_found",
                "找不到这个昵称或用户名",
            ));
        };
        Some(target.id)
    } else {
        None
    };

    let input = NewCard {
        kind: &kind,
        title: &text(&obj, "title"),
        note: &text(&obj, "note"),
        theme: &text(&obj, "theme"),
        reward_points: number(&obj, "rewardPoints").clamp(0, 1_000_000),
        reward_kind: &text(&obj, "rewardKind"),
        reward_value: &text(&obj, "rewardValue"),
        assigned_user_id: assigned.as_deref(),
        count: number(&obj, "count").clamp(1, 100),
        expires_days: number(&obj, "expiresDays").clamp(0, 3650),
    };

    let items = rewards::create(&st.pool, actor.user_id(), &input)
        .await
        .map_err(reward_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "items": items }))).into_response())
}

/// DELETE /api/v1/admin/rewards/cards/{id}
pub async fn admin_delete_card(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let done = rewards::admin_delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/admin/rewards/prizes
pub async fn admin_prizes(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = rewards::prizes(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items, "cost": rewards::LOTTERY_COST })).into_response())
}

/// POST /api/v1/admin/rewards/prizes
pub async fn admin_create_prize(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let input = PrizeInput {
        name: &text(&obj, "name"),
        kind: &text(&obj, "kind"),
        points: number(&obj, "points").clamp(0, 1_000_000),
        theme: &text(&obj, "theme"),
        weight: number(&obj, "weight").clamp(1, 10000),
        stock: obj.get("stock").and_then(|v| v.as_i64()),
        enabled: obj.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
    };
    let id = rewards::create_prize(&st.pool, &input)
        .await
        .map_err(reward_err)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "id": id }))).into_response())
}

/// PATCH /api/v1/admin/rewards/prizes/{id}
pub async fn admin_patch_prize(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let stock = if obj.contains_key("stock") {
        Some(obj.get("stock").and_then(|v| v.as_i64()))
    } else {
        None
    };
    let done = rewards::patch_prize(
        &st.pool,
        &id,
        obj.get("enabled").and_then(|v| v.as_bool()),
        obj.get("weight").and_then(|v| v.as_i64()),
        stock,
    )
    .await
    .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// DELETE /api/v1/admin/rewards/prizes/{id}
pub async fn admin_delete_prize(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let done = rewards::delete_prize(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
