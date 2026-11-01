//! 抽卡接口：前台读卡池 / 抽一张，后台维护卡池与消耗。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::{CurrentUser, MaybeUser};
use crate::errors::{ApiError, ApiResult};
use crate::gacha::{self, NewCard, PatchCard, RARITIES};
use crate::state::AppState;
use crate::{points, settings};

/// 每次抽卡消耗多少积分；缺省 20，等价于 2 个帖子 + 1 次签到的量
fn cost_of(s: &serde_json::Map<String, Value>) -> i64 {
    let raw = s.get("gachaCost");
    let n = raw
        .and_then(|v| v.as_i64())
        .or_else(|| raw.and_then(|v| v.as_str()).and_then(|v| v.parse().ok()))
        .unwrap_or(20);
    n.clamp(1, 10_000)
}

fn enabled_of(s: &serde_json::Map<String, Value>) -> bool {
    let raw = s.get("gachaEnabled");
    raw.and_then(|v| v.as_bool())
        .or_else(|| raw.and_then(|v| v.as_str()).map(|v| v == "true"))
        .unwrap_or(true)
}

fn rarity_of(v: Option<&Value>) -> Option<String> {
    let r = v?.as_str()?;
    if RARITIES.contains(&r) {
        Some(r.to_string())
    } else {
        None
    }
}

/// GET /api/v1/gacha —— 卡池 + 我的图鉴 / 最近抽卡
pub async fn overview(State(st): State<AppState>, maybe: MaybeUser) -> ApiResult<Response> {
    let s = settings::load(&st.pool, &st.cfg).await;
    let cards = gacha::pool(&st.pool).await.map_err(ApiError::internal)?;

    let mut owned = serde_json::Map::new();
    let mut recent = Vec::new();
    let mut balance = 0i64;
    if let Some(user) = maybe.0.as_ref() {
        for (id, count) in gacha::owned(&st.pool, &user.id)
            .await
            .map_err(ApiError::internal)?
        {
            owned.insert(id, json!(count));
        }
        recent = json!(gacha::my_draws(&st.pool, &user.id, 8)
            .await
            .map_err(ApiError::internal)?)
        .as_array()
        .cloned()
        .unwrap_or_default();
        balance = points::chip(&st.pool, &user.id)
            .await
            .map_err(ApiError::internal)?
            .map(|v| v.0)
            .unwrap_or(0);
    }

    Ok(Json(json!({
        "ok": true,
        "enabled": enabled_of(&s),
        "cost": cost_of(&s),
        "cards": cards,
        "owned": owned,
        "recent": recent,
        "points": balance,
    }))
    .into_response())
}

/// POST /api/v1/gacha/draw —— 花积分抽一张
pub async fn draw(State(st): State<AppState>, CurrentUser(user): CurrentUser) -> ApiResult<Response> {
    let s = settings::load(&st.pool, &st.cfg).await;
    if !enabled_of(&s) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "gacha_closed",
            "抽卡暂时关闭了",
        ));
    }
    let cost = cost_of(&s);

    match gacha::draw(&st.pool, &user.id, cost)
        .await
        .map_err(ApiError::internal)?
    {
        gacha::DrawResult::Ok { card, balance } => {
            let owned = gacha::owned(&st.pool, &user.id)
                .await
                .map_err(ApiError::internal)?;
            Ok(Json(json!({
                "ok": true,
                "card": card,
                "balance": balance,
                "cost": cost,
                "owned": owned.into_iter().collect::<std::collections::HashMap<_, _>>(),
            }))
            .into_response())
        }
        gacha::DrawResult::NotEnough { balance } => Err(ApiError::with_message(
            StatusCode::BAD_REQUEST,
            "not_enough_points",
            &format!("积分不够，本次需要 {cost}，当前 {balance}"),
        )),
        gacha::DrawResult::Empty => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "gacha_empty",
            "卡池里暂时没有可抽的卡",
        )),
    }
}

/// GET /api/v1/admin/gacha —— 全部卡片 + 消耗配置
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let s = settings::load(&st.pool, &st.cfg).await;
    let items = gacha::admin_list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "items": items,
        "config": { "cost": cost_of(&s), "enabled": enabled_of(&s) },
    }))
    .into_response())
}

/// PATCH /api/v1/admin/gacha/config —— 改消耗与开关
pub async fn admin_config(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    if let Some(cost) = payload.get("cost").and_then(|v| v.as_i64()) {
        if !(1..=10_000).contains(&cost) {
            return Err(ApiError::invalid_input("单次消耗应在 1 到 10000 之间"));
        }
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('gachaCost', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(json!(cost))
        .execute(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    }

    if let Some(enabled) = payload.get("enabled").and_then(|v| v.as_bool()) {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('gachaEnabled', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(json!(enabled))
        .execute(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    }

    Ok(Json(json!({ "ok": true })).into_response())
}

/// POST /api/v1/admin/gacha —— 新建卡片
pub async fn admin_create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let name = payload
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if name.is_empty() || name.chars().count() > 24 {
        return Err(ApiError::invalid_input("卡名 1–24 个字"));
    }
    let rarity = rarity_of(payload.get("rarity")).unwrap_or_else(|| "common".into());

    let weight = payload
        .get("weight")
        .and_then(|v| v.as_i64())
        .unwrap_or(100)
        .clamp(1, 10_000) as i32;
    let stock = payload
        .get("stock")
        .and_then(|v| v.as_i64())
        .unwrap_or(-1)
        .clamp(-1, 999_999) as i32;
    let emoji = payload
        .get("emoji")
        .and_then(|v| v.as_str())
        .unwrap_or("🎴")
        .trim();
    let emoji: String = if emoji.is_empty() {
        "🎴".into()
    } else {
        emoji.chars().take(4).collect()
    };
    let color = payload
        .get("color")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .chars()
        .take(9)
        .collect::<String>();
    let descr = payload
        .get("descr")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if descr.chars().count() > 120 {
        return Err(ApiError::invalid_input("描述不超过 120 字"));
    }

    let card = gacha::create(
        &st.pool,
        &NewCard {
            name,
            rarity: &rarity,
            weight,
            emoji: &emoji,
            color: &color,
            descr,
            stock,
            active: payload
                .get("active")
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "item": card })).into_response())
}

/// PATCH /api/v1/admin/gacha/{id}
pub async fn admin_patch(
    State(st): State<AppState>,
    Path(id): Path<String>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let name = payload.get("name").and_then(|v| v.as_str()).map(str::trim);
    if let Some(n) = name {
        if n.is_empty() || n.chars().count() > 24 {
            return Err(ApiError::invalid_input("卡名 1–24 个字"));
        }
    }
    let descr = payload.get("descr").and_then(|v| v.as_str()).map(str::trim);
    if let Some(d) = descr {
        if d.chars().count() > 120 {
            return Err(ApiError::invalid_input("描述不超过 120 字"));
        }
    }

    let rarity = match payload.get("rarity") {
        None => None,
        Some(v) => Some(rarity_of(Some(v)).ok_or_else(|| ApiError::invalid_input("稀有度不合法"))?),
    };

    let item = gacha::patch(
        &st.pool,
        &id,
        &PatchCard {
            name,
            rarity: rarity.as_deref(),
            weight: payload
                .get("weight")
                .and_then(|v| v.as_i64())
                .map(|v| v.clamp(1, 10_000) as i32),
            emoji: payload.get("emoji").and_then(|v| v.as_str()).map(str::trim),
            color: payload.get("color").and_then(|v| v.as_str()).map(str::trim),
            descr,
            stock: payload
                .get("stock")
                .and_then(|v| v.as_i64())
                .map(|v| v.clamp(-1, 999_999) as i32),
            active: payload.get("active").and_then(|v| v.as_bool()),
        },
    )
    .await
    .map_err(ApiError::internal)?
    .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/gacha/{id}
pub async fn admin_remove(
    State(st): State<AppState>,
    Path(id): Path<String>,
    _: AdminActor,
) -> ApiResult<Response> {
    if !gacha::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
