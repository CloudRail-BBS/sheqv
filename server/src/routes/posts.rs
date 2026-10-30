use axum::Json;
use axum::body::Bytes;
use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::auth::session;
use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{agreements, audit, forum, groups, points, settings};

/// 当前身份组是否允许某个动作
async fn require_permission(
    st: &AppState,
    user_id: &str,
    perm: &str,
    msg: &str,
) -> Result<(), ApiError> {
    if groups::can(&st.pool, user_id, perm)
        .await
        .map_err(ApiError::internal)?
    {
        Ok(())
    } else {
        Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "no_permission",
            msg,
        ))
    }
}

/// 组要求的公约必须都已签署（与社区公约取并集）
async fn require_group_agreements(st: &AppState, user_id: &str) -> Result<(), ApiError> {
    let ids = groups::required_agreements(&st.pool, user_id)
        .await
        .map_err(ApiError::internal)?;

    for id in ids {
        let Some(ag) = agreements::get(&st.pool, &id)
            .await
            .map_err(ApiError::internal)?
        else {
            continue;
        };
        let signed =
            agreements::is_signed_with_cookie(&st.pool, user_id, &ag.id, &ag.version, None).await;
        if !signed {
            return Err(ApiError::with_message(
                StatusCode::FORBIDDEN,
                "need_agreement",
                format!("当前身份组要求先签署《{}》", ag.title),
            ));
        }
    }
    Ok(())
}

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

/// GET /api/v1/posts[?q=关键词]
///
/// `q` 走标题 / 正文 / 标签的子串匹配（`ILIKE` + `pg_trgm` 索引）。
pub async fn list(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let q = params.get("q").map(String::as_str);
    let mut items = forum::list(&st.pool, q).await.map_err(ApiError::internal)?;
    forum::mark_liked(&st.pool, maybe.as_ref().map(|u| u.id.as_str()), &mut items)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "items": items, "total": items.len() })).into_response())
}

/// POST /api/v1/posts —— 需登录 + 社区公约；作者只取自会话
pub async fn create(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    require_permission(&st, &user.id, "post.create", "当前身份组没有发帖权限").await?;
    require_community(&st, &user.id, &headers).await?;
    require_group_agreements(&st, &user.id).await?;

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

    // 审核策略在写库前定状态：off 直接发布、ai 先过模型、all 全部待审
    let s = settings::load(&st.pool, &st.cfg).await;
    let pre = audit::precheck(&s, &st.ai_http, &title, &content).await;

    let id = forum::add(
        &st.pool,
        &user.id,
        forum::NewPost {
            title: &title,
            body: &content,
            tags,
            status: pre.status,
        },
    )
    .await
    .map_err(ApiError::internal)?;

    if let Some(v) = &pre.verdict {
        audit::record_ai(&st.pool, &id, v).await;
    }

    // 发帖加分。加分失败不拖累发帖：内容已经落库了，回头能补。
    if let Err(e) = points::award(&st.pool, &user.id, points::POST_REWARD, "post", Some(&id)).await {
        tracing::warn!(post = %id, error = %e, "发放发帖积分失败");
    }

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
    require_permission(&st, &user.id, "comment.create", "当前身份组没有评论权限").await?;
    require_community(&st, &user.id, &headers).await?;
    require_group_agreements(&st, &user.id).await?;

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

    // 自己给自己评论不发分：否则「发帖 → 自己刷评论 → 删帖」也能刷
    let self_comment: bool = sqlx::query_scalar("SELECT author_id = $2 FROM posts WHERE id = $1")
        .bind(&post_id)
        .bind(&user.id)
        .fetch_optional(&st.pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false);
    if !self_comment {
        if let Err(e) =
            points::award(&st.pool, &user.id, points::COMMENT_REWARD, "comment", Some(&comment.id))
                .await
        {
            tracing::warn!(comment = %comment.id, error = %e, "发放评论积分失败");
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "comment": comment })),
    )
        .into_response())
}

/// POST /api/v1/posts/:id/like —— 需登录；一人一票，再点一次取消。
///
/// 以前是匿名可点 + `like_count + 1`，刷新后前端又不知道点没点过，
/// 于是同一个人能无限刷。现在写进 `post_likes` 明细，计数由明细重算。
pub async fn like(
    State(st): State<AppState>,
    Path(post_id): Path<String>,
    MaybeUser(maybe): MaybeUser,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    match forum::toggle_like(&st.pool, &post_id, &user.id)
        .await
        .map_err(ApiError::internal)?
    {
        Some((likes, liked)) => Ok(
            Json(json!({ "ok": true, "likes": likes, "liked": liked })).into_response(),
        ),
        None => Err(ApiError::not_found()),
    }
}
