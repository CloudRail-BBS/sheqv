use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use rand::RngCore;

/// 进程参数。**业务配置不在这里**——站点名、人机验证、爱发电、注册开关
/// 都存在 `settings` 表里，由 `/api/v1/admin/settings` 改，改完立即生效。
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub data_dir: PathBuf,
    pub admin_token: Option<String>,
    pub public_base_url: Option<String>,
    pub app_version: String,
    /// GeeTest：id + key 都在才启用
    pub geetest_id: String,
    pub geetest_key: String,
    /// 官方"宕机模式"：校验接口不可达时放行，默认关（失败即拒绝）
    pub geetest_bypass_on_error: bool,
    pub site_name: String,
    pub afdian_user_id: String,
    pub afdian_token: String,
    pub afdian_page_url: String,
    /// 只在显式配置时生效；缺省走 `$DATA_DIR/.session-secret`
    session_secret_env: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = env::var("DATABASE_URL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .ok_or_else(|| {
                anyhow::anyhow!("缺少 DATABASE_URL（形如 postgres://user:pass@db:5432/arena）")
            })?;

        let port = match env::var("PORT") {
            Ok(v) if !v.trim().is_empty() => v.trim().parse::<u16>()?,
            _ => 8080,
        };

        let data_dir = env::var("DATA_DIR")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("./data"));

        Ok(Self {
            database_url,
            port,
            data_dir,
            admin_token: non_empty("ADMIN_TOKEN"),
            public_base_url: non_empty("PUBLIC_BASE_URL")
                .map(|u| u.trim_end_matches('/').to_string()),
            app_version: non_empty("APP_VERSION")
                .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string()),
            // 兼容只配了 NEXT_PUBLIC_GEETEST_ID 的老部署
            geetest_id: non_empty("GEETEST_ID")
                .or_else(|| non_empty("NEXT_PUBLIC_GEETEST_ID"))
                .unwrap_or_default(),
            geetest_key: non_empty("GEETEST_KEY").unwrap_or_default(),
            geetest_bypass_on_error: flag("GEETEST_BYPASS_ON_ERROR", false),
            site_name: non_empty("SITE_NAME").unwrap_or_else(|| "方块竞技场".to_string()),
            afdian_user_id: non_empty("AFDIAN_USER_ID").unwrap_or_default(),
            afdian_token: non_empty("AFDIAN_TOKEN").unwrap_or_default(),
            afdian_page_url: non_empty("AFDIAN_PAGE_URL")
                .map(|u| u.trim_end_matches('/').to_string())
                .unwrap_or_default(),
            session_secret_env: non_empty("SESSION_SECRET"),
        })
    }

    /// 会话密钥：`SESSION_SECRET` 优先，否则读 `$DATA_DIR/.session-secret`，都没有就生成一个。
    ///
    /// **必须复用同一个文件**：Node 版就是这么做的，Rust 另生成一个等于把全体用户瞬间登出。
    pub fn load_session_secret(&self) -> anyhow::Result<Vec<u8>> {
        if let Some(s) = &self.session_secret_env {
            return Ok(s.as_bytes().to_vec());
        }

        let file = self.data_dir.join(".session-secret");
        if let Ok(raw) = fs::read_to_string(&file) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.as_bytes().to_vec());
            }
        }

        // 首次启动：32 字节 hex，与 Node 版 randomBytes(32).toString('hex') 同格式
        let secret = random_hex(32);
        fs::create_dir_all(&self.data_dir)?;
        write_private(&file, &secret)?;
        Ok(secret.into_bytes())
    }
}

fn non_empty(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn flag(name: &str, fallback: bool) -> bool {
    match env::var(name) {
        Ok(v) => match v.trim().to_ascii_lowercase().as_str() {
            "" => fallback,
            "1" | "true" | "yes" | "on" => true,
            _ => false,
        },
        Err(_) => fallback,
    }
}

fn random_hex(len: usize) -> String {
    let mut buf = vec![0u8; len];
    rand::rng().fill_bytes(&mut buf);
    let mut out = String::with_capacity(len * 2);
    for b in buf {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn write_private(path: &Path, content: &str) -> std::io::Result<()> {
    fs::write(path, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}

/// 数据目录可写性检查（与 Node 版 `/api/health` 的语义一致）。
pub fn check_data_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("无法创建数据目录：{e}"))?;
    let probe = dir.join(".health-probe");
    fs::write(&probe, b"ok").map_err(|e| format!("数据目录不可写：{e}"))?;
    let _ = fs::remove_file(&probe);
    Ok(())
}
