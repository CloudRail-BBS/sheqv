//! 运营面板：社区运营情况汇总。
//!
//! 与 `/api/v1/admin/overview` 的区别是权限：这里只要 `OpsActor`
//! （管理员，或身份组勾了「进入运营面板」的账号），运营人员不需要整个后台。
//!
//! 返回的是「一眼能看出今天要不要干活」的几个数：总量 + 最近 7 天增量 + 待办队列。

use axum::Json;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::admin_auth::OpsActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

/// GET /api/v1/ops/summary
pub async fn summary(State(st): State<AppState>, _: OpsActor) -> ApiResult<Response> {
    let row: (i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM users)::bigint,
            (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::bigint,
            (SELECT count(*) FROM posts WHERE status = 'published')::bigint,
            (SELECT count(*) FROM posts WHERE created_at > now() - interval '7 days')::bigint,
            (SELECT count(*) FROM comments)::bigint,
            (SELECT count(*) FROM comments WHERE created_at > now() - interval '7 days')::bigint,
            (SELECT count(*) FROM post_likes)::bigint,
            (SELECT count(*) FROM resources WHERE status = 'published')::bigint,
            (SELECT count(*) FROM game_servers WHERE status = 'approved')::bigint,
            (SELECT count(*) FROM matches)::bigint,
            (SELECT count(*) FROM guilds)::bigint,
            (SELECT count(*) FROM teams)::bigint",
    )
    .fetch_one(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    let queues = crate::todos::queues(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "counts": {
            "users": row.0,
            "usersNew": row.1,
            "posts": row.2,
            "postsNew": row.3,
            "comments": row.4,
            "commentsNew": row.5,
            "likes": row.6,
            "resources": row.7,
            "servers": row.8,
            "matches": row.9,
            "guilds": row.10,
            "teams": row.11,
        },
        "queues": queues,
    }))
    .into_response())
}

/* ── 成员：禁言 ───────────────────────────────
   与后台的用户管理分开：这里只看得到「会不会被禁言」的字段，
   够运营同事处理骚扰，又看不到邮箱、登录时间这些隐私。 */

use axum::body::Bytes;
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use chrono::{Duration, Utc};
use serde_json::Value;
use std::collections::HashMap;

use crate::current_user::CurrentUser;
use crate::groups;

/// `user.mute` 权限（管理员天然通过）
async fn require_mute(st: &AppState, user_id: &str) -> Result<(), ApiError> {
    let ok = groups::can(&st.pool, user_id, "user.mute")
        .await
        .map_err(ApiError::internal)?;
    if ok {
        Ok(())
    } else {
        Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "no_permission",
            "当前账号没有禁言权限",
        ))
    }
}

/// GET /api/v1/ops/users?q=昵称或用户名
pub async fn members(
    State(st): State<AppState>,
    CurrentUser(me): CurrentUser,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    require_mute(&st, &me.id).await?;
    let key = q.get("q").map(|s| s.trim()).unwrap_or("");
    let like = format!("%{key}%");

    let rows: Vec<(String, String, String, String, Option<chrono::DateTime<Utc>>, String)> =
        sqlx::query_as(
            "SELECT id, username, nickname, role, muted_until, mute_reason
               FROM users
              WHERE ($1 = '' OR nickname ILIKE $2 OR username ILIKE $2)
              ORDER BY muted_until DESC NULLS LAST, created_at DESC
              LIMIT 30",
        )
        .bind(key)
        .bind(&like)
        .fetch_all(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    let now = Utc::now();
    let items: Vec<Value> = rows
        .into_iter()
        .map(|(id, username, nickname, role, until, reason)| {
            let muted = until.filter(|t| *t > now);
            json!({
                "id": id,
                "username": username,
                "nickname": nickname,
                "role": role,
                "mutedUntil": muted.map(|t| t.timestamp_millis()),
                "muteReason": if muted.is_some() { reason } else { String::new() },
            })
        })
        .collect();

    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/ops/users/{id}/mute  body: { minutes, reason }
pub async fn mute_member(
    State(st): State<AppState>,
    CurrentUser(me): CurrentUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    require_mute(&st, &me.id).await?;
    if id == me.id {
        return Err(ApiError::invalid_input("不能禁言自己"));
    }

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let minutes = payload
        .get("minutes")
        .and_then(Value::as_i64)
        .ok_or_else(|| ApiError::invalid_input("请选择禁言时长"))?;
    if !(1..=43_200).contains(&minutes) {
        return Err(ApiError::invalid_input("禁言时长需在 1 分钟到 30 天之间"));
    }
    // 原因必填：被禁言的人要看得懂为什么，运营也不敢写空话
    let reason = payload
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if reason.is_empty() {
        return Err(ApiError::invalid_input("请填写禁言原因"));
    }
    if reason.chars().count() > 120 {
        return Err(ApiError::invalid_input("原因不超过 120 字"));
    }

    let Some(target) = crate::users::find_by_id(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };
    if target.role == "admin" {
        return Err(ApiError::invalid_input("不能禁言管理员"));
    }

    let until = Utc::now() + Duration::minutes(minutes);
    let updated = crate::users::mute(&st.pool, &id, until, reason)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    // 给对方发一条站内信，说明到什么时候、为什么
    // 站内通知：写清到期时间与原因，附一条可点的入口
    // 站点按上海时区展示；服务端进程是 UTC，直接 format 会差 8 小时
    let until_local = until.with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap());
    let note = format!(
        "禁言至 {}（约 {}）。原因：{}",
        until_local.format("%Y-%m-%d %H:%M"),
        if minutes >= 1440 {
            format!("{} 天", minutes / 1440)
        } else if minutes >= 60 {
            format!("{} 小时", minutes / 60)
        } else {
            format!("{minutes} 分钟")
        },
        reason
    );
    crate::notifications::push(
        &st.pool,
        &id,
        "mute",
        "你被禁言了",
        &note,
        "/notifications",
    )
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "mutedUntil": updated.muted_until.map(|t| t.timestamp_millis()),
        "muteReason": updated.mute_reason,
    }))
    .into_response())
}

/// DELETE /api/v1/ops/users/{id}/mute
pub async fn unmute_member(
    State(st): State<AppState>,
    CurrentUser(me): CurrentUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    require_mute(&st, &me.id).await?;
    crate::users::unmute(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    // 提前解禁也告诉对方一声，免得还以为在禁言期
    let _ = crate::notifications::push(
        &st.pool,
        &id,
        "mute",
        "禁言已解除",
        "你的禁言已被管理员提前解除，可以正常发帖、评论与私信了。",
        "/notifications",
    )
    .await;
    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 联机大厅审核 ─────────────────────────────
   运营只做一件事：看过、给结论。地址校验与探测仍然由 `servers` 负责，
   审核通过后探测循环会自己接手。 */

/// GET /api/v1/ops/servers —— 待审在前，已处理的排在后面
pub async fn servers_queue(State(st): State<AppState>, _: OpsActor) -> ApiResult<Response> {
    use crate::servers::{self, ServerView};
    let mut items = servers::list(&st.pool, None, true)
        .await
        .map_err(ApiError::internal)?;
    items.sort_by(|a, b| {
        let rank = |s: &ServerView| if s.status == "pending" { 0 } else { 1 };
        rank(a).cmp(&rank(b)).then(b.created_at.cmp(&a.created_at))
    });
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

#[derive(serde::Deserialize)]
struct ReviewBody {
    status: String,
}

/// PATCH /api/v1/ops/servers/{id} —— 只接受审核结果
pub async fn server_review(
    State(st): State<AppState>,
    _: OpsActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    use crate::servers;
    let Ok(payload) = serde_json::from_slice::<ReviewBody>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let status = payload.status.trim().to_string();
    if !["approved", "rejected", "pending"].contains(&status.as_str()) {
        return Err(ApiError::invalid_input("状态不合法"));
    }

    let item = servers::review(&st.pool, &id, &status)
        .await
        .map_err(|e| match e {
            servers::ServerError::Db(err) => ApiError::internal(err),
            servers::ServerError::Invalid(msg) => ApiError::invalid_input(msg),
            _ => ApiError::not_found(),
        })?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/* ── 赛事报名审核 ─────────────────────────────
   报名是赛事下的条目，这里跨赛事统一看：待审的排在前面。 */

/// GET /api/v1/ops/tournament-entries
pub async fn entries_queue(State(st): State<AppState>, _: OpsActor) -> ApiResult<Response> {
    let items = crate::tournaments::recent_entries(&st.pool, 120)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// PATCH /api/v1/ops/tournament-entries/{id}
pub async fn entry_review(
    State(st): State<AppState>,
    _: OpsActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<ReviewBody>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let status = payload.status.trim().to_string();
    if !["approved", "rejected", "pending"].contains(&status.as_str()) {
        return Err(ApiError::invalid_input("状态不合法"));
    }

    let Some((user_id, title)) = crate::tournaments::review_entry(&st.pool, &id, &status)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };

    if status != "pending" {
        crate::tournaments::notify_review(&st.pool, &user_id, &title, &status).await;
    }

    Ok(Json(json!({ "ok": true })).into_response())
}

/* ── 删帖 ─────────────────────────────────────
   运营删帖要单独一条权限（`post.delete.any`），不能因为能审核就顺手删号。
   管理员天然通过；用 ADMIN_TOKEN 进来的也放行。 */

/// DELETE /api/v1/ops/posts/{id}
pub async fn delete_post(
    State(st): State<AppState>,
    actor: OpsActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if let Some(uid) = actor.user_id() {
        let ok = crate::groups::can(&st.pool, uid, "post.delete.any")
            .await
            .map_err(ApiError::internal)?;
        if !ok {
            return Err(ApiError::with_message(
                StatusCode::FORBIDDEN,
                "forbidden",
                "没有删除帖子的权限",
            ));
        }
    }

    let done = crate::forum::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    if done {
        Ok(Json(json!({ "ok": true })).into_response())
    } else {
        Err(ApiError::not_found())
    }
}
