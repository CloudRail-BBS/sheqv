use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

/// 连接池参数见 `docs/前后端分离方案.md` §5.2。
///
/// 上限 × 实例数必须小于 PG 的 `max_connections`，否则把数据库连接占满，
/// 连运维的 `psql` 都进不去。`acquire_timeout` 让池满时快速失败，而不是让用户干等。
pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        // 常驻 2 条：避免空闲后第一个请求承担建连成本（压测里 p95 会差 10 倍）
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .connect(database_url)
        .await
}

/// 执行内嵌迁移（`migrations/` 在编译期打包进二进制）。
///
/// sqlx 的 migration 在 PG 上会取 advisory lock，多个副本同时启动也只会跑一次。
/// 迁移失败必须直接退出——带着旧 schema 提供服务比不服务更糟。
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}
