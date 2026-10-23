//! 页面渲染要用的公开读接口。
//!
//! 站点设置必须**白名单投影**：`geetestKey` / `afdianToken` / OAuth secret
//! 这些一旦下发到浏览器就等于泄漏，所以不能直接把 `settings` 表整份返回。

use axum::Json;
use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{announcements, settings, slides};

/// 可以给浏览器看的键
const PUBLIC_KEYS: [&str; 13] = [
    "siteName",
    "logoText",
    "logoImage",
    "geetestId",
    "afdianPageUrl",
    "footerText",
    "footerIcp",
    "footerLinks",
    "meGuestText",
    "loginHint",
    "registerHint",
    "allowRegister",
    "homeShowAnnouncements",
];

fn no_store(res: &mut Response) {
    res.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
}

/// GET /api/v1/settings —— 只读公开项
pub async fn settings(State(st): State<AppState>) -> ApiResult<Response> {
    let all = settings::load(&st.pool, &st.cfg).await;

    let mut out = Map::new();
    for key in PUBLIC_KEYS {
        if let Some(v) = all.get(key) {
            out.insert(key.to_string(), v.clone());
        }
    }
    // 第三方登录是否可用：只看 id+secret 是否都配了，**不下发 secret 本身**
    let github_on = !settings::text(&all, "githubClientId").is_empty()
        && !settings::text(&all, "githubClientSecret").is_empty();
    let cnkd_on = !settings::text(&all, "cnkdClientId").is_empty()
        && !settings::text(&all, "cnkdClientSecret").is_empty();
    out.insert("githubEnabled".into(), json!(github_on));
    out.insert("cnkdEnabled".into(), json!(cnkd_on));

    // 空字符串表示"用默认文案"，前端自己兜底
    let mut res = Json(json!({ "ok": true, "settings": Value::Object(out) })).into_response();
    no_store(&mut res);
    Ok(res)
}

/// GET /api/v1/announcements —— 只看已发布
pub async fn announcements(State(st): State<AppState>) -> ApiResult<Response> {
    let items = announcements::list_published(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let mut res = Json(json!({ "ok": true, "items": items })).into_response();
    no_store(&mut res);
    Ok(res)
}

/// GET /api/v1/slides —— 只看启用中的
pub async fn slides(State(st): State<AppState>) -> ApiResult<Response> {
    let items = slides::list(&st.pool, true)
        .await
        .map_err(ApiError::internal)?;
    let mut res = Json(json!({ "ok": true, "items": items })).into_response();
    no_store(&mut res);
    Ok(res)
}

/* ── 详情与公开主页 ─────────────────────── */

use axum::extract::Path;

/// GET /api/v1/posts/{id}
pub async fn post(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    match crate::forum::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        Some(post) => Ok(Json(json!({ "ok": true, "post": post })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// GET /api/v1/announcements/{id} —— 未发布的按不存在处理
pub async fn announcement(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let item = announcements::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .filter(|a| a.published);

    match item {
        Some(item) => Ok(Json(json!({ "ok": true, "item": item })).into_response()),
        None => Err(ApiError::not_found()),
    }
}

/// 公开主页字段：**不含 email**，邮箱只有后台和本人能看到
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProfile {
    pub id: String,
    pub username: String,
    pub nickname: String,
    pub role: crate::users::Role,
    pub is_admin: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// GET /api/v1/users/{id}
pub async fn user(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let row = crate::users::find_by_id(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;

    let profile = PublicProfile {
        id: row.id.clone(),
        username: row.username.clone(),
        nickname: row.nickname.clone(),
        role: crate::users::Role::from_db(&row.role),
        is_admin: row.role == "admin",
        created_at: row.created_at.timestamp_millis(),
        title: row.title.clone(),
    };

    Ok(Json(json!({ "ok": true, "user": profile })).into_response())
}

/// GET /api/v1/users —— 公开用户列表（作者徽标批量渲染用）。
/// 只给公开字段，**不含 email**。
pub async fn users(State(st): State<AppState>) -> ApiResult<Response> {
    let rows = crate::users::list(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let items: Vec<PublicProfile> = rows
        .into_iter()
        .map(|row| PublicProfile {
            id: row.id.clone(),
            username: row.username.clone(),
            nickname: row.nickname.clone(),
            role: crate::users::Role::from_db(&row.role),
            is_admin: row.role == "admin",
            created_at: row.created_at.timestamp_millis(),
            title: row.title.clone(),
        })
        .collect();

    let mut res = Json(json!({ "ok": true, "items": items })).into_response();
    no_store(&mut res);
    Ok(res)
}

/// GET /api/v1/stats —— 首页与后台都要用的三个计数（不含任何敏感信息）
pub async fn stats(State(st): State<AppState>) -> ApiResult<Response> {
    let (posts, comments, likes) = crate::forum::stats(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    let mut res = Json(json!({ "ok": true, "posts": posts, "comments": comments, "likes": likes }))
        .into_response();
    no_store(&mut res);
    Ok(res)
}
