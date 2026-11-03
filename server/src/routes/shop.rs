//! 商城接口：前台看商品与兑换，后台维护商品。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::{CurrentUser, MaybeUser};
use crate::errors::{ApiError, ApiResult};
use crate::shop::{self, BuyError, NewItem, PatchItem};
use crate::state::AppState;

/// GET /api/v1/shop —— 商品 + 我的兑换记录 + 余额
pub async fn list(State(st): State<AppState>, MaybeUser(maybe): MaybeUser) -> ApiResult<Response> {
    let items = shop::list(&st.pool).await.map_err(ApiError::internal)?;

    let mut orders = Vec::new();
    let mut points = 0i64;
    if let Some(user) = maybe.as_ref() {
        orders = shop::my_orders(&st.pool, &user.id, 12)
            .await
            .map_err(ApiError::internal)?;
        points = crate::rank::points_of(&st.pool, &user.id)
            .await
            .map_err(ApiError::internal)?;
    }

    Ok(Json(json!({
        "ok": true,
        "items": items,
        "orders": orders,
        "points": points,
    }))
    .into_response())
}

/// POST /api/v1/shop/{id}/redeem
pub async fn redeem(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    match shop::redeem(&st.pool, &user.id, &id).await {
        Ok((balance, name)) => Ok(Json(json!({ "ok": true, "balance": balance, "itemName": name })).into_response()),
        Err(BuyError::NotFound) => Err(ApiError::not_found()),
        Err(BuyError::SoldOut) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "sold_out",
            "这件商品已经兑完了",
        )),
        Err(BuyError::NotEnough) => Err(ApiError::with_message(
            StatusCode::BAD_REQUEST,
            "not_enough_points",
            "积分不够，先去签到或完成几个任务",
        )),
        Err(BuyError::Db(e)) => Err(ApiError::internal(e)),
    }
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/shop
pub async fn admin_list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = shop::admin_list(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/shop
pub async fn admin_create(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    if name.is_empty() || name.chars().count() > 30 {
        return Err(ApiError::invalid_input("商品名 1–30 个字"));
    }
    let descr = payload.get("descr").and_then(|v| v.as_str()).unwrap_or("").trim();
    if descr.chars().count() > 300 {
        return Err(ApiError::invalid_input("说明不超过 300 字"));
    }
    let price = payload.get("price").and_then(|v| v.as_i64()).unwrap_or(0);
    if !(1..=1_000_000).contains(&price) {
        return Err(ApiError::invalid_input("价格要在 1–1000000 之间"));
    }

    let id = shop::create(
        &st.pool,
        &NewItem {
            name,
            descr,
            image: payload.get("image").and_then(|v| v.as_str()).unwrap_or(""),
            price,
            stock: payload.get("stock").and_then(|v| v.as_i64()).unwrap_or(-1),
            active: payload.get("active").and_then(|v| v.as_bool()).unwrap_or(true),
            sort: payload.get("sort").and_then(|v| v.as_i64()).unwrap_or(0),
        },
    )
    .await
    .map_err(ApiError::internal)?;

    let item = shop::get(&st.pool, &id).await.map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "item": item }))).into_response())
}

/// PATCH /api/v1/admin/shop/{id}
pub async fn admin_patch(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    if let Some(name) = payload.get("name").and_then(|v| v.as_str()).map(str::trim) {
        if name.is_empty() || name.chars().count() > 30 {
            return Err(ApiError::invalid_input("商品名 1–30 个字"));
        }
    }

    let done = shop::patch(
        &st.pool,
        &id,
        &PatchItem {
            name: payload.get("name").and_then(|v| v.as_str()),
            descr: payload.get("descr").and_then(|v| v.as_str()),
            image: payload.get("image").and_then(|v| v.as_str()),
            price: payload.get("price").and_then(|v| v.as_i64()),
            stock: payload.get("stock").and_then(|v| v.as_i64()),
            active: payload.get("active").and_then(|v| v.as_bool()),
            sort: payload.get("sort").and_then(|v| v.as_i64()),
        },
    )
    .await
    .map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }

    let item = shop::get(&st.pool, &id).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/shop/{id}
pub async fn admin_remove(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let done = shop::remove(&st.pool, &id).await.map_err(ApiError::internal)?;
    if !done {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}
