use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::users;
use crate::{notifications, points};

/// GET /api/v1/me/chrome —— 顶栏一次取齐：站内信 + 积分胶囊。
///
/// 之前 layout 先等站内信、再等积分，串行两跳；合并后登录用户每页少一跳，
/// 也避免为了两个数字去跑整份积分快照。
pub async fn chrome(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> ApiResult<Response> {
    let (items, unread) = notifications::feed(&st.pool, Some(&user))
        .await
        .map_err(ApiError::internal)?;
    let (points, today_done) = points::chip(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?
        .unwrap_or((0, false));

    let mut res = Json(json!({
        "ok": true,
        "notifications": { "items": items, "unread": unread },
        "points": { "points": points, "todayDone": today_done },
    }))
    .into_response();
    res.headers_mut()
        .insert(axum::http::header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
    Ok(res)
}

/// PATCH /api/v1/me —— 头衔与个人主页背景。
///
/// 昵称是帖子里已经落盘的作者名，改名会让历史帖子指向空，
/// 要做的话得先把帖子改成纯按 id 关联，不在这次范围内。
pub async fn patch_me(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    };
    let Some(obj) = payload.as_object() else {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    };
    if !obj.contains_key("title") && !obj.contains_key("profileBg") {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    }

    let mut updated = None;

    if let Some(title) = obj.get("title") {
        // 非字符串一律当空处理：与 Node 版 `typeof raw === 'string' ? raw : ''` 一致
        let raw = title.as_str().unwrap_or("");
        let clean = users::normalize_title(raw, user.is_admin).map_err(|msg| {
            ApiError::with_message(StatusCode::UNPROCESSABLE_ENTITY, "invalid_title", msg)
        })?;
        updated = users::set_title(&st.pool, &user.id, Some(clean.as_str()))
            .await
            .map_err(ApiError::internal)?;
    }

    if let Some(bg) = obj.get("profileBg") {
        let raw = bg.as_str().unwrap_or("").trim();
        let ok = raw.is_empty()
            || ((raw.starts_with("http://") || raw.starts_with("https://")
                || (raw.starts_with('/') && !raw.starts_with("//")))
                && raw.len() <= 500);
        if !ok {
            return Err(ApiError::with_message(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_bg",
                "背景图需为 http(s) 链接或站内路径（/ 开头），最长 500 字",
            ));
        }
        updated = users::set_profile_bg(&st.pool, &user.id, raw)
            .await
            .map_err(ApiError::internal)?;
    }

    let updated = updated.ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "user": updated })).into_response())
}
