use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Context;
use arena_api::config::Config;
use arena_api::state::AppState;
use arena_api::{db, routes};
use tokio::net::TcpListener;
use tower_http::compression::CompressionLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

/// 子命令：
/// - `serve`（默认）启动 HTTP 服务
/// - `healthcheck` 探一次 `/api/health`，给 Docker healthcheck 用（镜像里不用装 curl）
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let cmd = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "serve".to_string());
    match cmd.as_str() {
        "serve" => serve().await,
        "healthcheck" => healthcheck().await,
        "create-admin" => create_admin().await,
        other => {
            anyhow::bail!("未知子命令 {other}（可用：serve | healthcheck | create-admin）");
        }
    }
}

async fn serve() -> anyhow::Result<()> {
    // 出站 HTTPS 用 ring 作为 rustls 的 CryptoProvider（aws-lc 需要 cmake/nasm，多机环境常缺）
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cfg = Config::from_env()?;

    let pool = db::connect(&cfg.database_url)
        .await
        .context("连接 PostgreSQL 失败：检查 DATABASE_URL 与网络")?;
    // 迁移失败直接退出：宁可不可用，也不要带着旧 schema 提供服务
    db::migrate(&pool).await.context("执行数据库迁移失败")?;
    // 内置公约是数据不是代码：首次启动写入，之后由后台管理
    arena_api::agreements::ensure_builtin(&pool)
        .await
        .context("写入内置公约失败")?;
    // 空站的首页不该是一片空白：给一条欢迎轮播
    arena_api::slides::ensure_default(&pool)
        .await
        .context("写入默认轮播失败")?;

    let session_secret = cfg.load_session_secret()?;
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .context("初始化 HTTP 客户端失败")?;

    tracing::info!(
        port = cfg.port,
        version = %cfg.app_version,
        data_dir = %cfg.data_dir.display(),
        "arena-api 已就绪"
    );

    let state = AppState {
        pool,
        cfg: Arc::new(cfg.clone()),
        session_secret: Arc::new(session_secret),
        http,
        started_at: Instant::now(),
    };

    let app = routes::router(state)
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind(("0.0.0.0", cfg.port))
        .await
        .with_context(|| format!("端口 {} 绑定失败", cfg.port))?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("已优雅退出");
    Ok(())
}

/// `arena-api create-admin --username <u> --password <p> [--nickname <n>]`
///
/// 空站首次部署用它建管理员，避免「谁先注册谁是管理员」被抢注。
async fn create_admin() -> anyhow::Result<()> {
    let mut username = String::new();
    let mut password = String::new();
    let mut nickname = String::new();

    let mut args = std::env::args().skip(2);
    while let Some(flag) = args.next() {
        let mut value = || args.next().unwrap_or_default();
        match flag.as_str() {
            "--username" => username = value(),
            "--password" => password = value(),
            "--nickname" => nickname = value(),
            other => anyhow::bail!("未知参数 {other}"),
        }
    }

    if username.is_empty() || password.is_empty() {
        anyhow::bail!(
            "用法：create-admin --username <用户名> --password <密码> [--nickname <昵称>]"
        );
    }
    if nickname.is_empty() {
        nickname = username.clone();
    }

    let cfg = Config::from_env()?;
    let pool = db::connect(&cfg.database_url)
        .await
        .context("连接 PostgreSQL 失败")?;
    db::migrate(&pool).await.context("执行数据库迁移失败")?;
    arena_api::agreements::ensure_builtin(&pool)
        .await
        .context("写入内置公约失败")?;
    // 空站的首页不该是一片空白：给一条欢迎轮播
    arena_api::slides::ensure_default(&pool)
        .await
        .context("写入默认轮播失败")?;

    match arena_api::users::create_admin(&pool, &username, &nickname, &password).await {
        Ok(user) => {
            println!("已创建管理员：{}（{}）", user.username, user.id);
            Ok(())
        }
        Err(arena_api::users::CreateError::UsernameTaken) => {
            anyhow::bail!("用户名 {username} 已存在")
        }
        Err(arena_api::users::CreateError::EmailTaken) => anyhow::bail!("邮箱已被占用"),
        Err(arena_api::users::CreateError::Invalid(msg)) => anyhow::bail!("参数不合法：{msg}"),
        Err(arena_api::users::CreateError::Db(err)) => Err(anyhow::Error::from(err)),
    }
}

async fn healthcheck() -> anyhow::Result<()> {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let port = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(8080);

    // 手写一次 HTTP/1.1 探测：镜像里既不用装 curl，也不用为一条探活引入 HTTP 客户端依赖
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .with_context(|| format!("连接 127.0.0.1:{port} 失败"))?;
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(3)))?;
    stream
        .write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .context("发送探测请求失败")?;

    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).context("读取探测响应失败")?;
    let head = String::from_utf8_lossy(&raw);
    let status = head.lines().next().unwrap_or_default();

    if status.contains(" 200") {
        Ok(())
    } else {
        anyhow::bail!("健康检查未通过：{status}")
    }
}

fn init_tracing() {
    use tracing_subscriber::EnvFilter;

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,arena_api=debug"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .compact()
        .init();
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = term.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
