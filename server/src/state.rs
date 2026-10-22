use std::sync::Arc;
use std::time::Instant;

use sqlx::PgPool;

use crate::config::Config;

/// 全进程共享状态。`Clone` 很便宜（Arc + 连接池与客户端句柄）。
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub cfg: Arc<Config>,
    pub session_secret: Arc<Vec<u8>>,
    /// 出站 HTTP（GeeTest / 爱发电 / OAuth），统一 5 秒超时
    pub http: reqwest::Client,
    pub started_at: Instant,
}
