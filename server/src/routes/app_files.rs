//! 客户端安装包的站内托管。
//!
//! 之前 APK / EXE 只能填外链（网盘、GitHub Releases），运营每次发版都要先把文件传到别处。
//! 这里给一个最薄的方案：管理员把包传到 `$DATA_DIR/uploads/releases/`，
//! 站点用 `/downloads/<文件名>` 对外提供下载，后台只需要填这个相对地址。
//!
//! 只做两件事：写入与读取。不做版本管理（版本信息仍在 `app_releases`），
//! 也不做鉴权（安装包本身就是公开分发的），但文件名必须严格校验，避免路径穿越。

use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

/// 单个安装包上限。Windows 安装包 + 增量包留足余量。
pub const MAX_BYTES: usize = 400 * 1024 * 1024;

fn releases_dir(st: &AppState) -> std::path::PathBuf {
    st.cfg.data_dir.join("uploads").join("releases")
}

/// 只允许「字母数字点横线下划线」，且不能以点开头：
/// 挡掉 `../`、绝对路径、Windows 保留字符，同时保证 URL 里可以直接用。
fn safe_name(raw: &str) -> Option<String> {
    let name = raw.trim().rsplit(['/', '\\']).next().unwrap_or("").trim();
    if name.is_empty() || name.len() > 120 || name.starts_with('.') {
        return None;
    }
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'));
    if !ok || !name.contains('.') {
        return None;
    }
    Some(name.to_string())
}

fn content_type(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".apk") {
        "application/vnd.android.package-archive"
    } else if lower.ends_with(".dmg") {
        "application/x-apple-diskimage"
    } else if lower.ends_with(".zip") {
        "application/zip"
    } else {
        "application/octet-stream"
    }
}

/// 解析 `Range: bytes=start-end`；suffix 形式（`bytes=-1024`）不支持，直接回整包。
fn parse_range(headers: &HeaderMap) -> Option<(u64, Option<u64>)> {
    let raw = headers.get(header::RANGE)?.to_str().ok()?;
    let first = raw.strip_prefix("bytes=")?.split(',').next()?.trim();
    let (start, end) = first.split_once('-')?;
    if start.trim().is_empty() {
        return None;
    }
    let start = start.trim().parse::<u64>().ok()?;
    let end = if end.trim().is_empty() {
        None
    } else {
        Some(end.trim().parse::<u64>().ok()?)
    };
    Some((start, end))
}

/// POST /api/v1/admin/apps/upload?name=CloudRail-1.0.0.apk
///
/// 请求体就是文件本体（前端从 FormData 里取出 File 直接发上来），
/// 省掉 multipart 解析，几百兆的包也不用在内存里再拼一遍。
pub async fn upload(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(name) = q.get("name").and_then(|v| safe_name(v)) else {
        return Err(ApiError::invalid_input(
            "文件名不合法（只能字母数字与 . - _ +，且需要扩展名）",
        ));
    };
    if body.is_empty() {
        return Err(ApiError::invalid_input("没有收到文件内容"));
    }
    if body.len() > MAX_BYTES {
        return Err(ApiError::invalid_input("安装包超过 400MB，请改用外链"));
    }

    let dir = releases_dir(&st);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(ApiError::internal)?;
    tokio::fs::write(dir.join(&name), &body)
        .await
        .map_err(ApiError::internal)?;

    Ok(axum::Json(json!({
        "ok": true,
        "name": name,
        "size": body.len(),
        // 相对地址：换域名、走反代都不会失效
        "url": format!("/downloads/{name}"),
    }))
    .into_response())
}

/// GET /downloads/{name} —— 公开下载，支持 Range（断点续传 / 下载器分段）
pub async fn download(
    State(st): State<AppState>,
    Path(name): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let Some(name) = safe_name(&name) else {
        return Err(ApiError::not_found());
    };
    let path = releases_dir(&st).join(&name);
    let Ok(mut file) = tokio::fs::File::open(&path).await else {
        return Err(ApiError::not_found());
    };
    let size = file
        .metadata()
        .await
        .map(|m| m.len())
        .map_err(ApiError::internal)?;

    let mut resp = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type(&name))
        .header(header::ACCEPT_RANGES, "bytes")
        .header(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_str(&format!("attachment; filename=\"{name}\""))
                .unwrap_or(HeaderValue::from_static("attachment")),
        )
        .header(header::CACHE_CONTROL, "public, max-age=3600");

    let body = match parse_range(&headers) {
        Some((start, end)) if start < size => {
            let end = end.unwrap_or(size - 1).min(size - 1);
            let len = end - start + 1;
            file.seek(std::io::SeekFrom::Start(start))
                .await
                .map_err(ApiError::internal)?;
            resp = resp
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
                .header(header::CONTENT_LENGTH, len);
            Body::from_stream(ReaderStream::new(file.take(len)))
        }
        _ => {
            resp = resp.header(header::CONTENT_LENGTH, size);
            Body::from_stream(ReaderStream::new(file))
        }
    };

    resp.body(body).map_err(ApiError::internal)
}
