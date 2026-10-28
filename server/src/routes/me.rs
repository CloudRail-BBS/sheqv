use std::collections::HashMap;

use axum::Json;
use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::users;
use crate::{media, notifications, object_storage, points};

/// POST /api/v1/me/media?kind=avatar|background|post
///
/// 客户端直接 PUT 图片字节，Content-Type 只作提示；服务端按魔数判类型。
/// 头像/背景上传成功会顺手删掉上一张本站图片，避免库里越攒越多。
pub async fn upload_media(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Query(params): Query<HashMap<String, String>>,
    _headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let kind = params.get("kind").map(String::as_str).unwrap_or("post");
    if !media::kind_ok(kind) {
        return Err(ApiError::invalid_input("图片用途不正确"));
    }
    if body.is_empty() {
        return Err(ApiError::invalid_input("没有收到图片"));
    }
    if body.len() > media::MAX_BYTES {
        return Err(ApiError::with_message(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too_large",
            "图片不能超过 2MB",
        ));
    }
    let Some(mime) = media::detect(&body) else {
        return Err(ApiError::with_message(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_image",
            "只支持 PNG / JPEG / WebP / GIF",
        ));
    };

    // 选了对象存储就上传到桶；否则继续走 PostgreSQL bytea
    let object = st
        .object_store
        .resolve(&st.pool, st.cfg.as_ref())
        .await
        .map_err(|e| {
            ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e)
        })?;

    let id = if let Some((store, conf, true)) = object {
        let object_id = crate::ids::next('o');
        let key = conf.object_key(kind, &user.id, &object_id, mime);
        object_storage::put(&store, &key, body.clone())
            .await
            .map_err(|e| {
                ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e)
            })?;
        media::save_object(&st.pool, &user.id, kind, mime, &key, body.len())
            .await
            .map_err(ApiError::internal)?
    } else {
        media::save_local(&st.pool, &user.id, kind, mime, &body)
            .await
            .map_err(ApiError::internal)?
    };
    let url = format!("/api/v1/media/{id}");

    if kind == "avatar" {
        if let Some(updated) = users::set_avatar(&st.pool, &user.id, &url)
            .await
            .map_err(ApiError::internal)?
        {
            if !user.avatar.is_empty() {
                let _ = media::delete_url(&st, &user.id, &user.avatar).await;
            }
            return Ok(Json(json!({ "ok": true, "url": url, "user": updated })).into_response());
        }
        return Err(ApiError::not_found());
    }

    if kind == "background" {
        if let Some(updated) = users::set_profile_bg(&st.pool, &user.id, &url)
            .await
            .map_err(ApiError::internal)?
        {
            if !user.profile_bg.is_empty() {
                let _ = media::delete_url(&st, &user.id, &user.profile_bg).await;
            }
            return Ok(Json(json!({ "ok": true, "url": url, "user": updated })).into_response());
        }
        return Err(ApiError::not_found());
    }

    Ok(Json(json!({ "ok": true, "url": url })).into_response())
}

/// GET /api/v1/media/{id}[?w=256] —— 公开读图，长缓存
///
/// `w` 是目标宽度：给了就出缩略图，没给时**头像自动按 256px 出**，其它类型出原图。
/// 这样老页面不用改参数也能一起变快（原先 33px 的头像在传 400KB 的原图）。
pub async fn media_file(
    State(st): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    if id.len() > 40 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(ApiError::not_found());
    }
    let Some(row) = media::load(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };

    let requested = q.get("w").and_then(|v| v.trim().parse::<u32>().ok());
    let target = match requested {
        Some(w) => w.clamp(media::MIN_WIDTH, media::MAX_WIDTH),
        None if row.kind == "avatar" => media::AVATAR_WIDTH,
        None => 0,
    };
    // 动图缩完只剩第一帧，宁可原样返回
    let resizable = row.mime != "image/gif";

    // 命中缓存就直接回去，不去碰原图（S3 上原图要跨网络拉一次）
    if resizable && target > 0 {
        if let Some(v) = media::load_variant(&st.pool, &id, target)
            .await
            .map_err(ApiError::internal)?
        {
            return Ok(image_response(v.bytes, &v.mime, &id, target));
        }
    }

    let bytes: Vec<u8> = if row.storage == "s3" {
        let resolved = st
            .object_store
            .resolve(&st.pool, st.cfg.as_ref())
            .await
            .map_err(|e| {
                ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e)
            })?;
        let Some((store, _, _)) = resolved else {
            return Err(ApiError::with_message(
                StatusCode::SERVICE_UNAVAILABLE,
                "storage_unavailable",
                "对象存储未配置",
            ));
        };
        object_storage::get(&store, &row.object_key)
            .await
            .map_err(|e| {
                ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e)
            })?
            .into()
    } else {
        row.bytes.clone().unwrap_or_default()
    };

    if resizable && target > 0 {
        // 原图本来就比目标小就不要再缩：放大只会更糊
        let bigger = media::dimensions(&bytes).map(|(w, _)| w > target).unwrap_or(true);
        if bigger {
            if let Some((mime, small)) = media::make_variant(&bytes, target, row.kind == "avatar") {
                // 存失败不影响这次返回，下次再算一遍而已
                let _ = media::save_variant(&st.pool, &id, target, &mime, &small).await;
                return Ok(image_response(small, &mime, &id, target));
            }
        }
    }

    Ok(image_response(bytes, &row.mime, &id, target))
}

/// 统一的图片响应：一年强缓存 + ETag，CDN / 反向代理可以放心存
fn image_response(bytes: Vec<u8>, mime: &str, id: &str, width: u32) -> Response {
    let len = bytes.len();
    let etag = format!("\"{id}-{width}\"");
    let mut res = Response::new(Body::from(bytes));
    let headers = res.headers_mut();
    headers.insert(header::CONTENT_TYPE, mime.parse().expect("固定 MIME"));
    headers.insert(header::CONTENT_LENGTH, len.to_string().parse().expect("数字"));
    headers.insert(
        header::CACHE_CONTROL,
        "public, max-age=31536000, immutable".parse().expect("固定值"),
    );
    headers.insert(header::ETAG, etag.parse().expect("ASCII"));
    res
}

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
    let dm_unread = crate::dm::unread_total(&st.pool, &user.id)
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
        "dm": { "unread": dm_unread },
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
    if !obj.contains_key("title")
        && !obj.contains_key("profileBg")
        && !obj.contains_key("avatar")
    {
        return Err(ApiError::invalid_input("没有要修改的内容"));
    }

    let mut updated = None;

    if obj.contains_key("title") {
        // 头衔改成申请制：这里只负责拒绝，真正的入口是 /api/v1/me/title-requests
        return Err(ApiError::with_message(
            StatusCode::UNPROCESSABLE_ENTITY,
            "title_requires_review",
            "头衔需要申请并由管理员审核，请在「我的 → 头衔」里提交申请",
        ));
    }

    let media_url_ok = |raw: &str| {
        raw.is_empty()
            || ((raw.starts_with("http://")
                || raw.starts_with("https://")
                || (raw.starts_with('/') && !raw.starts_with("//")))
                && raw.len() <= 500)
    };

    if let Some(avatar) = obj.get("avatar") {
        let raw = avatar.as_str().unwrap_or("").trim();
        if !media_url_ok(raw) {
            return Err(ApiError::with_message(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_avatar",
                "头像需为 http(s) 链接或站内路径（/ 开头），最长 500 字",
            ));
        }
        let old = user.avatar.clone();
        updated = users::set_avatar(&st.pool, &user.id, raw)
            .await
            .map_err(ApiError::internal)?;
        if raw.is_empty() && !old.is_empty() {
            let _ = media::delete_url(&st, &user.id, &old).await;
        }
    }

    if let Some(bg) = obj.get("profileBg") {
        let raw = bg.as_str().unwrap_or("").trim();
        if !media_url_ok(raw) {
            return Err(ApiError::with_message(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_bg",
                "背景图需为 http(s) 链接或站内路径（/ 开头），最长 500 字",
            ));
        }
        let old = user.profile_bg.clone();
        updated = users::set_profile_bg(&st.pool, &user.id, raw)
            .await
            .map_err(ApiError::internal)?;
        if raw.is_empty() && !old.is_empty() {
            let _ = media::delete_url(&st, &user.id, &old).await;
        }
    }

    let updated = updated.ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "user": updated })).into_response())
}
