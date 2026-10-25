//! 资源文件上传 / 下载：本地上传，流式落盘，下载同源返回。

use std::collections::HashMap;

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use futures_util::StreamExt;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

use crate::current_user::CurrentUser;
use crate::errors::{ApiError, ApiResult};
use crate::resource_files::{self, MAX_BYTES};
use crate::state::AppState;

/// POST /api/v1/me/resource-file?name=xxx
pub async fn upload(
    State(st): State<AppState>,
    CurrentUser(user): CurrentUser,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: Body,
) -> ApiResult<Response> {
    let raw_name = q.get("name").map(String::as_str).unwrap_or("resource.bin");
    let name = raw_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("resource.bin")
        .trim()
        .chars()
        .take(120)
        .collect::<String>();
    let name = if name.is_empty() {
        "resource.bin".to_string()
    } else {
        name
    };
    let mime = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or(v).trim().to_string())
        .filter(|v| !v.is_empty() && v.len() <= 100)
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let dir = st.cfg.data_dir.join("uploads").join("resources");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| ApiError::internal(format!("创建上传目录失败：{e}")))?;

    let id = crate::ids::next('f');
    let path = dir.join(&id);
    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|e| ApiError::internal(format!("创建文件失败：{e}")))?;

    let mut stream = body.into_data_stream();
    let mut size = 0usize;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| ApiError::invalid_input("上传数据中断"))?;
        size += chunk.len();
        if size > MAX_BYTES {
            drop(file);
            let _ = tokio::fs::remove_file(&path).await;
            return Err(ApiError::with_message(
                StatusCode::PAYLOAD_TOO_LARGE,
                "too_large",
                "资源文件不能超过 100MB",
            ));
        }
        file.write_all(&chunk)
            .await
            .map_err(|e| ApiError::internal(format!("写入文件失败：{e}")))?;
    }
    file.flush()
        .await
        .map_err(|e| ApiError::internal(format!("写入文件失败：{e}")))?;
    drop(file);

    if size == 0 {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(ApiError::invalid_input("文件为空"));
    }

    resource_files::insert(&st.pool, &id, &user.id, &name, &mime, size as i64, &id)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "id": id,
        "name": name,
        "mime": mime,
        "size": size,
        "url": format!("/api/v1/resource-files/{id}"),
    }))
    .into_response())
}

/// GET /api/v1/resource-files/{id}
pub async fn download(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    if id.len() > 40 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(ApiError::not_found());
    }
    let Some(row) = resource_files::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };

    let path = st
        .cfg
        .data_dir
        .join("uploads")
        .join("resources")
        .join(&row.path);
    let file = tokio::fs::File::open(&path).await.map_err(|_| ApiError::not_found())?;
    let meta = file.metadata().await.map_err(ApiError::internal)?;
    let len = meta.len();
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let encoded = utf8_percent_encode(&row.name, NON_ALPHANUMERIC).to_string();
    let mut res = Response::new(body);
    let h = res.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        row.mime
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().expect("固定值")),
    );
    h.insert(header::CONTENT_LENGTH, len.to_string().parse().expect("数字"));
    h.insert(
        header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"resource\"; filename*=UTF-8''{encoded}")
            .parse()
            .expect("文件名"),
    );
    h.insert(header::CACHE_CONTROL, "public, max-age=86400".parse().expect("固定值"));
    Ok(res)
}
