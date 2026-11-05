//! 后台待办与总览接口。
//!
//! 全部要求管理员会话（`AdminActor`）。待办本身不区分人 —— 后台通常只有一两个管理员，
//! 共享一份清单比给每人一份更实用（谁勾掉都算处理完）。

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::NaiveDate;
use serde_json::{Value, json};

use crate::admin_auth::{AdminActor, OpsActor};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::todos::{self, NewTodo, PatchTodo};

/// 优先级只认这三个值；非法值统一落回 normal，不因为一个下拉框报错把整条待办丢掉
fn priority_of(v: Option<&Value>) -> &'static str {
    match v.and_then(|v| v.as_str()).unwrap_or("normal") {
        "high" => "high",
        "low" => "low",
        _ => "normal",
    }
}

/// `YYYY-MM-DD`；空串 / null 都当作「没有截止日」
fn due_of(v: Option<&Value>) -> Result<Option<NaiveDate>, ApiError> {
    let Some(raw) = v.and_then(|v| v.as_str()).map(str::trim) else {
        return Ok(None);
    };
    if raw.is_empty() {
        return Ok(None);
    }
    NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| ApiError::invalid_input("截止日期格式应为 YYYY-MM-DD"))
}

/// GET /api/v1/admin/todos
pub async fn list(State(st): State<AppState>, _: AdminActor) -> ApiResult<Response> {
    let items = todos::list(&st.pool).await.map_err(ApiError::internal)?;
    let stats = todos::stats(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items, "stats": stats })).into_response())
}

/// POST /api/v1/admin/todos
pub async fn create(
    State(st): State<AppState>,
    actor: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let note = payload
        .get("note")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if title.is_empty() {
        return Err(ApiError::invalid_input("先写一句要做什么"));
    }
    if title.chars().count() > 80 {
        return Err(ApiError::invalid_input("待办标题不超过 80 字"));
    }
    if note.chars().count() > 300 {
        return Err(ApiError::invalid_input("备注不超过 300 字"));
    }

    let item = todos::create(
        &st.pool,
        &NewTodo {
            title,
            note,
            priority: priority_of(payload.get("priority")),
            due_date: due_of(payload.get("dueDate"))?,
        },
        actor.user_id(),
    )
    .await
    .map_err(ApiError::internal)?;

    let stats = todos::stats(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "item": item, "stats": stats })).into_response())
}

/// PATCH /api/v1/admin/todos/{id}
pub async fn patch(
    State(st): State<AppState>,
    Path(id): Path<String>,
    _: AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim);
    if let Some(t) = title {
        if t.is_empty() {
            return Err(ApiError::invalid_input("标题不能为空"));
        }
        if t.chars().count() > 80 {
            return Err(ApiError::invalid_input("待办标题不超过 80 字"));
        }
    }

    let note = payload.get("note").and_then(|v| v.as_str()).map(str::trim);
    if let Some(n) = note {
        if n.chars().count() > 300 {
            return Err(ApiError::invalid_input("备注不超过 300 字"));
        }
    }

    let status = match payload.get("status").and_then(|v| v.as_str()) {
        None => None,
        Some("open") => Some("open"),
        Some("done") => Some("done"),
        Some(_) => return Err(ApiError::invalid_input("状态只有 open / done")),
    };

    // 只有显式传了 dueDate 才动这一列：没传 = 不改，传 null / "" = 清空
    let (due_date, clear_due) = match payload.get("dueDate") {
        None => (None, false),
        Some(v) => (due_of(Some(v))?, true),
    };

    let item = todos::patch(
        &st.pool,
        &id,
        &PatchTodo {
            title,
            note,
            priority: payload.get("priority").map(|v| priority_of(Some(v))),
            due_date,
            clear_due,
            status,
        },
    )
    .await
    .map_err(ApiError::internal)?
    .ok_or_else(ApiError::not_found)?;

    let stats = todos::stats(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "item": item, "stats": stats })).into_response())
}

/// DELETE /api/v1/admin/todos/{id}
pub async fn remove(
    State(st): State<AppState>,
    Path(id): Path<String>,
    _: AdminActor,
) -> ApiResult<Response> {
    if !todos::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    let stats = todos::stats(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "stats": stats })).into_response())
}

/// GET /api/v1/admin/overview —— 后台外壳与首页共用
///
/// 只做聚合：待办统计 + 六条队列的积压情况。返回体很小，可以每次请求都取。
pub async fn overview(State(st): State<AppState>, _: OpsActor) -> ApiResult<Response> {
    let queues = todos::queues(&st.pool).await.map_err(ApiError::internal)?;
    let stats = todos::stats(&st.pool).await.map_err(ApiError::internal)?;
    let pending: i64 = queues.iter().map(|q| q.count).sum();

    // 运行环境：后台要能看到缓存到底走 Redis 还是进程内
    let redis_configured = st.cfg.redis_url.is_some();
    let redis_connected = st.cache.is_redis();
    let redis_note = if redis_connected {
        "已连接：缓存与登录/私信限流都走 Redis，多实例共享"
    } else if redis_configured {
        "配了 REDIS_URL 但连不上，已降级为进程内；多实例下限流不共享"
    } else {
        "未配置 REDIS_URL：单实例够用，缓存与限流在进程内；多实例部署建议配上"
    };

    Ok(Json(json!({
        "ok": true,
        "queues": queues,
        "todos": stats,
        "pending": pending,
        "system": {
            "redis": {
                "configured": redis_configured,
                "connected": redis_connected,
                "note": redis_note,
            },
        },
    }))
    .into_response())
}
