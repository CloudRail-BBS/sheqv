use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use crate::config::check_data_dir;
use crate::state::AppState;

/// `GET /api/health`
///
/// 字段与 Node 版保持同构（`ok / service / version / uptime / time / checks`），
/// 只把 `checks` 从 `dataDir` 扩成 `database + dataDir`。
/// 供 Docker healthcheck、反代探活与监控使用，**不返回任何环境变量或路径细节**。
pub async fn health(State(st): State<AppState>) -> Response {
    // SELECT 1 只看连通性；PG 不可用时这里会快速失败（池的 acquire_timeout 是 5s）
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&st.pool)
        .await
        .is_ok();
    let dir = check_data_dir(&st.cfg.data_dir);
    let ok = db_ok && dir.is_ok();

    let mut body = json!({
        "ok": ok,
        "service": "blockarena-api",
        "version": st.cfg.app_version.clone(),
        "uptime": st.started_at.elapsed().as_secs(),
        "time": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "checks": {
            "database": if db_ok { "ok" } else { "unavailable" },
            "dataDir": if dir.is_ok() { "ok" } else { "unwritable" },
        }
    });

    if !db_ok {
        body["error"] = json!("database_unavailable");
    } else if let Err(reason) = dir {
        body["error"] = json!(reason);
    }

    let status = if ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(body)).into_response()
}
