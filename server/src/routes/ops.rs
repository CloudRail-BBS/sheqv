//! 运营面板：社区运营情况汇总。
//!
//! 与 `/api/v1/admin/overview` 的区别是权限：这里只要 `OpsActor`
//! （管理员，或身份组勾了「进入运营面板」的账号），运营人员不需要整个后台。
//!
//! 返回的是「一眼能看出今天要不要干活」的几个数：总量 + 最近 7 天增量 + 待办队列。

use axum::Json;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::admin_auth::OpsActor;
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;

/// GET /api/v1/ops/summary
pub async fn summary(State(st): State<AppState>, _: OpsActor) -> ApiResult<Response> {
    let row: (i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM users)::bigint,
            (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::bigint,
            (SELECT count(*) FROM posts WHERE status = 'published')::bigint,
            (SELECT count(*) FROM posts WHERE created_at > now() - interval '7 days')::bigint,
            (SELECT count(*) FROM comments)::bigint,
            (SELECT count(*) FROM comments WHERE created_at > now() - interval '7 days')::bigint,
            (SELECT count(*) FROM post_likes)::bigint,
            (SELECT count(*) FROM resources WHERE status = 'published')::bigint,
            (SELECT count(*) FROM game_servers WHERE status = 'approved')::bigint,
            (SELECT count(*) FROM matches)::bigint,
            (SELECT count(*) FROM guilds)::bigint,
            (SELECT count(*) FROM teams)::bigint",
    )
    .fetch_one(&st.pool)
    .await
    .map_err(ApiError::internal)?;

    let queues = crate::todos::queues(&st.pool)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(json!({
        "ok": true,
        "counts": {
            "users": row.0,
            "usersNew": row.1,
            "posts": row.2,
            "postsNew": row.3,
            "comments": row.4,
            "commentsNew": row.5,
            "likes": row.6,
            "resources": row.7,
            "servers": row.8,
            "matches": row.9,
            "guilds": row.10,
            "teams": row.11,
        },
        "queues": queues,
    }))
    .into_response())
}
