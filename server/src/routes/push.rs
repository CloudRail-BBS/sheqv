//! 推送接口。
//!
//! 公开部分（取公钥、订阅、退订）只要求同源；后台部分走 `AdminActor`。

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::ids;
use crate::push::{self, PushPayload};
use crate::settings;
use crate::state::AppState;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body).ok()?.as_object().cloned()
}

fn s(map: &Map<String, Value>, key: &str) -> String {
    map.get(key).and_then(|v| v.as_str()).unwrap_or_default().trim().to_string()
}

/* ── 公开 ───────────────────────────────── */

/// GET /api/v1/push/key —— 前端订阅前先取 VAPID 公钥
pub async fn key(State(st): State<AppState>) -> ApiResult<Response> {
    let keys = push::ensure_keys(&st.pool, &st.cfg)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "enabled": true,
        "publicKey": keys.public_b64,
    }))
    .into_response())
}

/// POST /api/v1/push/subscribe
///
/// body: `{ endpoint, keys: { p256dh, auth } }`（浏览器 `PushSubscription.toJSON()` 原样）
pub async fn subscribe(
    State(st): State<AppState>,
    MaybeUser(user): MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(b) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };
    let endpoint = s(&b, "endpoint");
    if endpoint.is_empty() || !endpoint.starts_with("https://") {
        return Err(ApiError::invalid_input("缺少合法的 endpoint"));
    }
    let keys = b.get("keys").and_then(|v| v.as_object()).cloned().unwrap_or_default();
    let p256dh = s(&keys, "p256dh");
    let auth = s(&keys, "auth");
    if p256dh.is_empty() || auth.is_empty() {
        return Err(ApiError::invalid_input("缺少 p256dh / auth"));
    }

    let ua = b
        .get("ua")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .chars()
        .take(180)
        .collect::<String>();
    let uid = user.as_ref().map(|u| u.id.clone());

    // endpoint 唯一：同一设备重复订阅时更新归属，不新增行
    sqlx::query(
        "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, ua)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id),
               p256dh = EXCLUDED.p256dh,
               auth = EXCLUDED.auth,
               ua = EXCLUDED.ua,
               fail_count = 0",
    )
    .bind(ids::next('p'))
    .bind(&uid)
    .bind(&endpoint)
    .bind(&p256dh)
    .bind(&auth)
    .bind(&ua)
    .execute(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true })).into_response())
}

/// POST /api/v1/push/unsubscribe —— body: `{ endpoint }`
pub async fn unsubscribe(State(st): State<AppState>, body: Bytes) -> ApiResult<Response> {
    let Some(b) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };
    let endpoint = s(&b, "endpoint");
    if endpoint.is_empty() {
        return Err(ApiError::invalid_input("缺少 endpoint"));
    }
    sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = $1")
        .bind(&endpoint)
        .execute(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/push —— 概览：订阅数、最近发送
pub async fn overview(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM push_subscriptions")
        .fetch_one(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let signed: i64 =
        sqlx::query_scalar("SELECT count(*) FROM push_subscriptions WHERE user_id IS NOT NULL")
            .fetch_one(&st.pool)
            .await
            .map_err(ApiError::internal)?;

    let recent: Vec<(String, String, String, String, String, i32, i32, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            "SELECT id, title, body, url, audience, sent_count, fail_count, created_at
             FROM push_messages ORDER BY created_at DESC LIMIT 20",
        )
        .fetch_all(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    let keys = push::ensure_keys(&st.pool, &st.cfg)
        .await
        .map_err(ApiError::internal)?;
    let settings_map = settings::load(&st.pool, &st.cfg).await;

    Ok(Json(json!({
        "ok": true,
        "subscriptions": total,
        "signedIn": signed,
        "publicKey": keys.public_b64,
        "subject": settings::text(&settings_map, "vapidSubject"),
        "recent": recent.into_iter().map(|(id, title, body, url, audience, sent, fail, at)| json!({
            "id": id,
            "title": title,
            "body": body,
            "url": url,
            "audience": audience,
            "sent": sent,
            "failed": fail,
            "createdAt": at.timestamp_millis(),
        })).collect::<Vec<_>>(),
    }))
    .into_response())
}

/// POST /api/v1/admin/push/send —— body: `{ title, body, url, audience }`
pub async fn send(State(st): State<AppState>, actor: AdminActor, body: Bytes) -> ApiResult<Response> {
    let Some(b) = parse_body(&body) else {
        return Err(ApiError::invalid_input("请求体不是合法 JSON"));
    };
    let title = s(&b, "title");
    if title.is_empty() {
        return Err(ApiError::invalid_input("标题不能为空"));
    }
    let payload = PushPayload {
        title: title.chars().take(60).collect(),
        body: s(&b, "body").chars().take(160).collect(),
        url: {
            let u = s(&b, "url");
            if u.starts_with('/') { u } else { "/".into() }
        },
        tag: s(&b, "tag"),
    };
    let audience = match s(&b, "audience").as_str() {
        "signed_in" => "signed_in",
        "admins" => "admins",
        _ => "all",
    };

    let keys = push::ensure_keys(&st.pool, &st.cfg)
        .await
        .map_err(ApiError::internal)?;
    let (ok, fail) = push::broadcast(&st.http, &st.pool, &keys, &payload, audience).await;

    let id = ids::next('m');
    sqlx::query(
        "INSERT INTO push_messages (id, title, body, url, audience, sent_count, fail_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(&id)
    .bind(&payload.title)
    .bind(&payload.body)
    .bind(&payload.url)
    .bind(audience)
    .bind(ok as i32)
    .bind(fail as i32)
    .bind(
        actor
            .user
            .as_ref()
            .map(|u| u.nickname.clone())
            .unwrap_or_else(|| "admin-token".into()),
    )
    .execute(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(json!({ "ok": true, "id": id, "sent": ok, "failed": fail })).into_response())
}

/// DELETE /api/v1/admin/push/subscriptions —— 清理失效订阅
pub async fn prune(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let n = sqlx::query("DELETE FROM push_subscriptions WHERE fail_count >= 3")
        .execute(&st.pool)
        .await
        .map_err(ApiError::internal)?
        .rows_affected();
    Ok(Json(json!({ "ok": true, "removed": n })).into_response())
}
