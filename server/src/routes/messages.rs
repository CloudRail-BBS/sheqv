//! 后台系统消息：给单个用户或全站发一条站内信。
//!
//! 复用 `notifications` 表（kind=system），不新建一套「公告」；
//! 这样用户端的铃铛、通知页、未读计数都不用改。

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

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

/// GET /api/v1/admin/messages —— 最近发送的系统消息（按人拆开展示，便于确认发给谁）
pub async fn list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let rows: Vec<(String, String, String, String, String, String, i64, bool)> = sqlx::query_as(
        "SELECT n.id, n.user_id, u.nickname, n.title, n.body, n.href,
                (extract(epoch FROM n.created_at) * 1000)::bigint AS created_at,
                (n.read_at IS NOT NULL) AS read
           FROM notifications n
           JOIN users u ON u.id = n.user_id
          WHERE n.kind = 'system'
          ORDER BY n.created_at DESC
          LIMIT 50",
    )
    .fetch_all(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    let items: Vec<Value> = rows
        .into_iter()
        .map(|(id, user_id, nickname, title, body, href, at, read)| {
            json!({
                "id": id,
                "userId": user_id,
                "nickname": nickname,
                "title": title,
                "body": body,
                "href": href,
                "createdAt": at,
                "read": read,
            })
        })
        .collect();

    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/admin/messages
/// body: { userId?: string, title, body, href? }
///
/// `userId` 为空表示全站（跳过被封禁账号）。
pub async fn send(
    State(st): State<AppState>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let title = text(&obj, "title");
    let body_text = text(&obj, "body");
    let href = text(&obj, "href");
    let user_id = text(&obj, "userId");

    let tl = title.chars().count();
    if !(2..=40).contains(&tl) {
        return Err(ApiError::invalid_input("标题需要 2–40 个字"));
    }
    let bl = body_text.chars().count();
    if !(2..=300).contains(&bl) {
        return Err(ApiError::invalid_input("正文需要 2–300 个字"));
    }
    if !href.is_empty() && (!href.starts_with('/') || href.chars().count() > 200) {
        return Err(ApiError::invalid_input("跳转地址需以 / 开头，且不超过 200 字"));
    }

    if !user_id.is_empty() {
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM users WHERE id = $1")
            .bind(&user_id)
            .fetch_optional(&st.pool)
            .await
            .map_err(ApiError::internal)?;
        if exists.is_none() {
            return Err(ApiError::not_found());
        }
        crate::notifications::push(
            &st.pool,
            &user_id,
            "system",
            &title,
            &body_text,
            &href,
        )
        .await
        .map_err(ApiError::internal)?;
        return Ok(Json(json!({ "ok": true, "count": 1 })).into_response());
    }

    // 全站：一条 INSERT ... SELECT，不逐人往返；id 用 md5 保证唯一
    let count = sqlx::query(
        "INSERT INTO notifications (id, user_id, kind, title, body, href)
         SELECT 'n' || md5(random()::text || clock_timestamp()::text || u.id),
                u.id, 'system', $1, $2, $3
           FROM users u
          WHERE NOT u.banned",
    )
    .bind(&title)
    .bind(&body_text)
    .bind(&href)
    .execute(&st.pool)
    .await
    .map_err(ApiError::internal)?
    .rows_affected();

    Ok(Json(json!({ "ok": true, "count": count })).into_response())
}
