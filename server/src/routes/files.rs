//! 后台文件管理：用户上传的图片与资源文件，统一查看与删除。

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::admin_auth::AdminActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{media, object_storage, resource_files};

/// GET /api/v1/admin/files?q=&limit= —— 图片与资源文件各取一页 + 汇总
pub async fn list(
    State(st): State<AppState>,
    _: AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let keyword = q.get("q").cloned().unwrap_or_default();
    let limit = q
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(60);

    let media_rows = media::admin_list(&st.pool, &keyword, "", limit)
        .await
        .map_err(ApiError::internal)?;
    let (media_count, media_bytes) = media::total_bytes(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    let res_rows = resource_files::list(&st.pool, &keyword, limit)
        .await
        .map_err(ApiError::internal)?;
    let (res_count, res_bytes): (i64, i64) = sqlx::query_as(
        "SELECT count(*)::bigint, COALESCE(sum(size), 0)::bigint FROM resource_files",
    )
    .fetch_one(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    let media_items: Vec<serde_json::Value> = media_rows
        .into_iter()
        .map(|(id, kind, owner, mime, size, storage, created)| {
            json!({
                "id": id,
                "kind": kind,
                "owner": owner,
                "mime": mime,
                "size": size,
                "storage": storage,
                "createdAt": created.timestamp_millis(),
                "url": format!("/api/v1/media/{id}"),
            })
        })
        .collect();

    let resource_items: Vec<serde_json::Value> = res_rows
        .into_iter()
        .map(|(id, name, owner, size, mime, storage, created)| {
            json!({
                "id": id,
                "name": name,
                "owner": owner,
                "size": size,
                "mime": mime,
                "storage": storage,
                "createdAt": created.timestamp_millis(),
                "url": format!("/api/v1/resource-files/{id}"),
            })
        })
        .collect();

    Ok(Json(json!({
        "ok": true,
        "media": { "items": media_items, "count": media_count, "bytes": media_bytes },
        "resources": { "items": resource_items, "count": res_count, "bytes": res_bytes },
    }))
    .into_response())
}

/// DELETE /api/v1/admin/files/media/{id}
pub async fn remove_media(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !media::admin_delete(&st, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// DELETE /api/v1/admin/files/resource/{id}
pub async fn remove_resource(
    State(st): State<AppState>,
    _: AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let Some(row) = resource_files::remove(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::not_found());
    };

    if row.storage == "s3" && !row.object_key.is_empty() {
        if let Ok(Some((store, _, _))) = st.object_store.resolve(&st.pool, st.cfg.as_ref()).await {
            let _ = object_storage::delete(&store, &row.object_key).await;
        }
    } else if !row.path.is_empty() {
        let path = st
            .cfg
            .data_dir
            .join("uploads")
            .join("resources")
            .join(&row.path);
        let _ = tokio::fs::remove_file(path).await;
    }

    Ok(Json(json!({ "ok": true })).into_response())
}
