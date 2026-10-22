use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::auth::session;
use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{agreements, forum};

fn need_login() -> ApiError {
    // 注意：发帖相关接口的未登录是 403，与登录接口的 401 不同（历史契约）
    ApiError::with_message(StatusCode::FORBIDDEN, "need_login", "请先登录")
}

/// 发帖与评论都要求：已登录取，且已按**当前版本**签署社区公约
async fn require_community(
    st: &AppState,
    user_id: &str,
    headers: &HeaderMap,
) -> Result<(), ApiError> {
    let Some(ag) = agreements::get(&st.pool, "community")
        .await
        .map_err(ApiError::internal)?
    else {
        return Ok(());
    };
    let cookie = session::cookie_value(headers, "ag_community");
    let ok = agreements::is_signed_with_cookie(
        &st.pool,
        user_id,
        &ag.id,
        &ag.version,
        cookie.as_deref(),
    )
    .await;
    if ok {
        Ok(())
    } else {
        Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "need_agreement",
            "请先签署《社区公约》",
        ))
    }
}

/// GET /api/v1/posts
pub async fn list(State(st): State<AppState>) -> ApiResult<Response> {
    let items = forum::list(&st.pool).await.map_err(ApiError::internal)?;
    Ok(Json(json!({ "items": items })).into_response())
}

/// POST /api/v1/posts —— 需登录 + 社区公约；作者只取自会话
pub async fn create(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    require_community(&st, &user.id, &headers).await?;

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let obj = payload.as_object().cloned().unwrap_or_default();
    let text = |key: &str| {
        obj.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string()
    };

    let title = text("title");
    let content = text("body");
    if let Some(msg) = forum::validate_post(&title, &content) {
        return Err(ApiError::invalid_input(msg));
    }

    let tags = obj
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str())
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .take(3)
                .collect()
        })
        .unwrap_or_default();

    let id = forum::add(
        &st.pool,
        &user.id,
        forum::NewPost {
            title: &title,
            body: &content,
            tags,
        },
    )
    .await
    .map_err(ApiError::internal)?;

    let post = forum::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "post": post })),
    )
        .into_response())
}

/// POST /api/v1/posts/:id/comments —— 需登录 + 社区公约
pub async fn comment(
    State(st): State<AppState>,
    Path(post_id): Path<String>,
    MaybeUser(maybe): MaybeUser,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    require_community(&st, &user.id, &headers).await?;

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let text = payload
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let len = text.chars().count();
    if len < 2 {
        return Err(ApiError::invalid_input("评论至少 2 个字"));
    }
    if len > 300 {
        return Err(ApiError::invalid_input("评论不超过 300 字"));
    }

    let comment = forum::add_comment(&st.pool, &post_id, &user.id, &text)
        .await
        .map_err(ApiError::internal)?;
    let Some(comment) = comment else {
        return Err(ApiError::not_found());
    };

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "comment": comment })),
    )
        .into_response())
}

/// POST /api/v1/posts/:id/like —— 匿名可点、可重复点（计数器语义），不需要签公约
pub async fn like(State(st): State<AppState>, Path(post_id): Path<String>) -> ApiResult<Response> {
    let likes = forum::like(&st.pool, &post_id)
        .await
        .map_err(ApiError::internal)?;
    match likes {
        Some(n) => Ok(Json(json!({ "ok": true, "likes": n })).into_response()),
        None => Err(ApiError::not_found()),
    }
}
