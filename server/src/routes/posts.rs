use axum::Json;
use axum::body::Bytes;
use std::collections::HashMap;

use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::admin_auth::AdminActor;
use crate::auth::session;
use crate::captcha::{self, CaptchaPayload, CaptchaResult};
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
pub(crate) async fn require_community(
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
    // tab：recommend（默认，互动加权）/ new（最新）/ following（关注的人）/ joined（我赞过或回复过）
    let tab = params.get("tab").map(String::as_str).unwrap_or("recommend");
    let viewer = maybe.as_ref().map(|u| u.id.as_str());
    // section：按版块筛选（首页的版块胶囊用）
    let section = params.get("section").map(String::as_str);
    let mut items = forum::list(&st.pool, q, tab, viewer, section)
        .await
        .map_err(ApiError::internal)?;
    forum::mark_liked(&st.pool, maybe.as_ref().map(|u| u.id.as_str()), &mut items)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "items": items, "total": items.len() })).into_response())
}

/// POST /api/v1/posts —— 需登录 + 社区公约；作者只取自会话
pub async fn create(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    require_permission(&st, &user.id, "post.create", "当前身份组没有发帖权限").await?;
    require_community(&st, &user.id, &headers).await?;
    require_group_agreements(&st, &user.id).await?;
    // 禁言期内不能发新帖；文案里带剩余时长与原因
    if let Some(notice) = user.mute_notice() {
        return Err(ApiError::with_message(StatusCode::FORBIDDEN, "muted", notice));
    }

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

    // 站点配了极验就必须带票：缺票直接拒绝，前端会弹验证层再重提
    let s = settings::load(&st.pool, &st.cfg).await;
    let captcha_payload: Option<CaptchaPayload> =
        serde_json::from_value(obj.get("captcha").cloned().unwrap_or(Value::Null)).ok();
    match captcha::verify(&st.http, &st.cfg, &s, captcha_payload.as_ref()).await {
        CaptchaResult::Failed(code) => {
            return Err(ApiError::with_message(
                StatusCode::BAD_REQUEST,
                "captcha_failed",
                if code == "missing_captcha" {
                    "请先完成人机验证"
                } else {
                    "人机验证未通过，请重试"
                },
            ));
        }
        _ => {}
    }

    // 版块 / 标签都由后台维护，写库前对着 content_categories 校验一遍；
    // 表里还没配（空表）时不拦，避免后台清空后彻底发不了帖。
    let section_keys = crate::categories::keys(&st.pool, "post_section")
        .await
        .map_err(ApiError::internal)?;
    let raw_section = text("section");
    let section = if section_keys.is_empty() {
        if raw_section.is_empty() {
            "常规".to_string()
        } else {
            raw_section
        }
    } else if raw_section.is_empty() {
        section_keys[0].clone()
    } else if section_keys.iter().any(|k| k == &raw_section) {
        raw_section
    } else {
        return Err(ApiError::invalid_input("版块不存在，刷新页面后重选"));
    };

    let mut tags: Vec<String> = Vec::new();
    if let Some(arr) = obj.get("tags").and_then(|v| v.as_array()) {
        for t in arr.iter().filter_map(|t| t.as_str()) {
            let t = t.trim();
            if t.is_empty() || tags.iter().any(|x| x == t) {
                continue;
            }
            tags.push(t.to_string());
            if tags.len() == 3 {
                break;
            }
        }
    }
    let tag_keys = crate::categories::keys(&st.pool, "post_tag")
        .await
        .map_err(ApiError::internal)?;
    if !tag_keys.is_empty() {
        if let Some(bad) = tags.iter().find(|t| !tag_keys.iter().any(|k| k == *t)) {
            return Err(ApiError::invalid_input(format!(
                "标签「{bad}」已不存在，刷新页面后重选"
            )));
        }
    }

    // 审核策略在写库前定状态：off 直接发布、ai 先过模型、all 全部待审
    let s = settings::load(&st.pool, &st.cfg).await;
    let pre = audit::precheck(&s, &st.ai_http, &title, &content).await;

    // 归属地：发帖时查一次（800ms 上限）；查不到就留空，不影响发布
    let ip = crate::geo::client_ip(&headers).or(Some(peer.ip()));
    let ip_region = crate::geo::region(&st.http, ip).await;

    let id = forum::add(
        &st.pool,
        &user.id,
        forum::NewPost {
            title: &title,
            body: &content,
            section: &section,
            tags,
            status: pre.status,
            ip_region: ip_region.as_deref(),
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
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    require_permission(&st, &user.id, "comment.create", "当前身份组没有评论权限").await?;
    require_community(&st, &user.id, &headers).await?;
    require_group_agreements(&st, &user.id).await?;
    if let Some(notice) = user.mute_notice() {
        return Err(ApiError::with_message(StatusCode::FORBIDDEN, "muted", notice));
    }

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let text = payload
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let settings_now = settings::load(&st.pool, &st.cfg).await;
    let captcha_payload: Option<CaptchaPayload> =
        serde_json::from_value(payload.get("captcha").cloned().unwrap_or(Value::Null)).ok();
    match captcha::verify(&st.http, &st.cfg, &settings_now, captcha_payload.as_ref()).await {
        CaptchaResult::Failed(code) => {
            return Err(ApiError::with_message(
                StatusCode::BAD_REQUEST,
                "captcha_failed",
                if code == "missing_captcha" {
                    "请先完成人机验证"
                } else {
                    "人机验证未通过，请重试"
                },
            ));
        }
        _ => {}
    }

    let len = text.chars().count();
    if len < 2 {
        return Err(ApiError::invalid_input("评论至少 2 个字"));
    }
    if len > 300 {
        return Err(ApiError::invalid_input("评论不超过 300 字"));
    }

    // 归属地：只查一次（800ms 上限），查不到就留空，接口照常返回
    let ip = crate::geo::client_ip(&headers).or(Some(peer.ip()));
    let ip_region = crate::geo::region(&st.http, ip).await;

    let comment = forum::add_comment(&st.pool, &post_id, &user.id, &text, ip_region.as_deref())
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

/// PATCH /api/v1/posts/:id —— 作者本人或管理员二次编辑
pub async fn edit(
    State(st): State<AppState>,
    Path(post_id): Path<String>,
    MaybeUser(maybe): MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    let Some(post) = forum::get(&st.pool, &post_id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };

    let is_author = post.author_id.as_deref() == Some(user.id.as_str());
    let can_moderate = groups::can(&st.pool, &user.id, "audit.review")
        .await
        .map_err(ApiError::internal)?;
    if !is_author && !can_moderate {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "forbidden",
            "只能编辑自己的帖子",
        ));
    }

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    let content = payload
        .get("body")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");

    if title.chars().count() > 80 {
        return Err(ApiError::invalid_input("标题不超过 80 字"));
    }
    if content.chars().count() < 2 {
        return Err(ApiError::invalid_input("正文至少 2 个字"));
    }
    if content.chars().count() > 8000 {
        return Err(ApiError::invalid_input("正文不超过 8000 字"));
    }

    let updated = forum::edit(
        &st.pool,
        &post_id,
        if title.is_empty() { None } else { Some(title) },
        content,
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(post) => Ok(Json(json!({ "ok": true, "post": post })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// PUT /api/v1/posts/:id/notice —— 管理员声明
///
/// 声明独立于正文，编辑帖子不会覆盖它；传空串即取消。
pub async fn set_notice(
    State(st): State<AppState>,
    _: AdminActor,
    Path(post_id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let note = payload
        .get("note")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if note.chars().count() > 500 {
        return Err(ApiError::invalid_input("声明不能超过 500 字"));
    }

    let updated = forum::set_notice(&st.pool, &post_id, note)
        .await
        .map_err(ApiError::internal)?;
    match updated {
        Some(post) => Ok(Json(json!({ "ok": true, "post": post })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// PATCH /api/v1/posts/:id/flags —— 置顶 / 精华
///
/// 以前只有 admin 能改；现在有 `post.pin` 权限的版主也能在帖子里直接操作，
/// 不用为了置顶一个帖专门进后台。
pub async fn flags(
    State(st): State<AppState>,
    Path(post_id): Path<String>,
    MaybeUser(maybe): MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(user) = maybe else {
        return Err(ApiError::new(StatusCode::UNAUTHORIZED, "unauthorized"));
    };
    require_permission(&st, &user.id, "post.pin", "没有置顶或加精的权限").await?;

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };
    let updated = forum::set_flags(
        &st.pool,
        &post_id,
        payload.get("pinned").and_then(|v| v.as_bool()),
        payload.get("featured").and_then(|v| v.as_bool()),
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(post) => Ok(Json(json!({ "ok": true, "post": post })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// PATCH /api/v1/admin/posts/:id/flags —— 后台的置顶 / 精华
pub async fn admin_flags(
    State(st): State<AppState>,
    Path(post_id): Path<String>,
    _: crate::admin_auth::AdminActor,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let updated = forum::set_flags(
        &st.pool,
        &post_id,
        payload.get("pinned").and_then(|v| v.as_bool()),
        payload.get("featured").and_then(|v| v.as_bool()),
    )
    .await
    .map_err(ApiError::internal)?;

    match updated {
        Some(post) => Ok(Json(json!({ "ok": true, "post": post })).into_response()),
        None => Err(ApiError::not_found()),
    }
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
