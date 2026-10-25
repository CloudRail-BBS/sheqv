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
    /// 审核用的 AI 客户端：模型响应慢，超时放宽到 30 秒
    pub ai_http: reqwest::Client,
    /// Rusted Warfare 中转站房间的进程内缓存（按中转站地址，TTL 见 `relay::CACHE_TTL`）
    pub relay: crate::relay::Cache,
    /// 对象存储客户端缓存；后台改配置后按指纹重建
    pub object_store: crate::object_storage::Cache,
    pub started_at: Instant,
}
