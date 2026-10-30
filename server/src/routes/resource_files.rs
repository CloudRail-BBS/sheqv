//! 资源文件上传 / 下载。
//!
//! 配了对象存储就流式写进桶（不整块进内存），否则落本地磁盘；
//! 下载按 `storage` 分流，两种存储对调用方是同一套 URL。

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
use crate::object_storage;

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

    let id = crate::ids::next('f');

    // 有对象存储就直接写桶：100MB 的文件不能整块读进内存，用 buf writer 流式上传
    let object = st
        .object_store
        .resolve(&st.pool, st.cfg.as_ref())
        .await
        .map_err(|e| ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e))?;

    let mut stream = body.into_data_stream();
    let mut size = 0usize;
    let mut storage = "fs".to_string();
    let mut object_key = String::new();
    let mut local_path = id.clone();

    if let Some((store, conf, true)) = object {
        let key = conf.object_key("resource", &user.id, &id, &mime);
        let path = object_storage::path_of(&key)
            .map_err(|e| ApiError::internal(format!("对象路径不合法：{e}")))?;
        let mut writer = object_store::buffered::BufWriter::new(store, path);

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| ApiError::invalid_input("上传数据中断"))?;
            size += chunk.len();
            if size > MAX_BYTES {
                writer.abort().await;
                return Err(ApiError::with_message(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "too_large",
                    "资源文件不能超过 100MB",
                ));
            }
            writer
                .write_all(&chunk)
                .await
                .map_err(|e| ApiError::internal(format!("写入对象存储失败：{e}")))?;
        }
        writer
            .shutdown()
            .await
            .map_err(|e| ApiError::internal(format!("写入对象存储失败：{e}")))?;
        storage = "s3".to_string();
        object_key = key;
        local_path = String::new();
    } else {
        let dir = st.cfg.data_dir.join("uploads").join("resources");
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| ApiError::internal(format!("创建上传目录失败：{e}")))?;
        let path = dir.join(&id);
        let mut file = tokio::fs::File::create(&path)
            .await
            .map_err(|e| ApiError::internal(format!("创建文件失败：{e}")))?;

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
    }

    if size == 0 {
        return Err(ApiError::invalid_input("文件为空"));
    }

    resource_files::insert(
        &st.pool, &id, &user.id, &name, &mime, size as i64, &local_path, &storage, &object_key,
    )
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

    let body = if row.storage == "s3" && !row.object_key.is_empty() {
        let resolved = st
            .object_store
            .resolve(&st.pool, st.cfg.as_ref())
            .await
            .map_err(|e| ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e))?;
        let Some((store, _, _)) = resolved else {
            return Err(ApiError::with_message(
                StatusCode::SERVICE_UNAVAILABLE,
                "storage_unavailable",
                "对象存储未配置",
            ));
        };
        let stream = object_storage::stream(&store, &row.object_key)
            .await
            .map_err(|e| ApiError::with_message(StatusCode::BAD_GATEWAY, "storage_error", &e))?;
        Body::from_stream(stream)
    } else {
        let path = st
            .cfg
            .data_dir
            .join("uploads")
            .join("resources")
            .join(&row.path);
        let file = tokio::fs::File::open(&path).await.map_err(|_| ApiError::not_found())?;
        Body::from_stream(ReaderStream::new(file))
    };

    let encoded = utf8_percent_encode(&row.name, NON_ALPHANUMERIC).to_string();
    let mut res = Response::new(body);
    let h = res.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        row.mime
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().expect("固定值")),
    );
    h.insert(
        header::CONTENT_LENGTH,
        row.size.to_string().parse().expect("数字"),
    );
    h.insert(
        header::CONTENT_DISPOSITION,
        format!("attachment; filename=\"resource\"; filename*=UTF-8''{encoded}")
            .parse()
            .expect("文件名"),
    );
    h.insert(header::CACHE_CONTROL, "public, max-age=86400".parse().expect("固定值"));
    Ok(res)
}
