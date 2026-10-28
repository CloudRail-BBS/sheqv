//! 站点设置：**只存被后台改过的键**，读取时与环境变量、内置默认值合并。
//!
//! 优先级：`settings` 表 > 环境变量 > 内置默认。
//! 删掉某一行即回落到环境变量——后台每个字段旁的「恢复环境变量」就是删行。
//!
//! 有意**不**放进数据库的项：`SESSION_SECRET` / `ADMIN_TOKEN`（落库会随备份泄漏）、
//! `DATABASE_URL` / `PORT` / `DATA_DIR`（启动前就要确定）。

use serde_json::{Map, Value, json};
use sqlx::PgPool;

use crate::config::Config;

/// 允许被后台覆盖的键。不在这个名单里的键会被静默丢弃。
pub const KEYS: [&str; 73] = [
    "siteName",
    "logoText",
    "logoImage",
    // SEO：搜索引擎与社交分享用的描述 / 关键词，留空走内置文案
    "seoTitle",
    "seoDescription",
    "seoKeywords",
    "seoOgImage",
    "seoIndex",
    "seoVerification",
    "seoTwitter",
    // 对象存储（S3 兼容：阿里云 OSS / 雨云 ROS）
    "storageDriver",
    "storageEndpoint",
    "storageRegion",
    "storageBucket",
    "storageAccessKey",
    "storageSecretKey",
    "storagePathPrefix",
    "storageForcePathStyle",
    // 个推（Android 推送）
    "getuiAppId",
    "getuiAppKey",
    "getuiAppSecret",
    "getuiMasterSecret",
    "publicBaseUrl",
    "geetestId",
    "geetestKey",
    "afdianUserId",
    "afdianToken",
    "afdianPageUrl",
    "githubClientId",
    "githubClientSecret",
    "cnkdClientId",
    "cnkdClientSecret",
    "footerText",
    "footerIcp",
    "footerLinks",
    "meGuestText",
    "loginHint",
    "registerHint",
    // 登录页左侧能力条：每行「标题|描述」，最多 3 条；留空则用内置文案
    "loginPoints",
    // 各列表页标题下的说明文案；留空用前端内置文案
    "guildsHint",
    "teamsHint",
    "matchesHint",
    "serversHint",
    "resourcesHint",
    "devTeamsHint",
    "leaderboardHint",
    "pointsHint",
    "rewardsHint",
    "announcementsHint",
    "policiesHint",
    "allowRegister",
    "homeShowAnnouncements",
    // 帖子流样式：list（单列）/ card（双列卡片）
    "feedLayout",
    // 邮箱验证码登录（SMTP 配置只落库，不下发给浏览器）
    "emailLoginEnabled",
    "smtpHost",
    "smtpPort",
    "smtpUser",
    "smtpPass",
    "smtpFrom",
    "smtpSecure",
    // 内容审核：off / ai / all
    "postAuditMode",
    // AI 预审：OpenAI 兼容接口。密钥只存库，不落日志
    "aiBaseUrl",
    "aiApiKey",
    "aiModel",
    "aiPrompt",
    // 导航：逗号分隔的 key，空串 = 前端内置默认
    // 浏览器推送：密钥首次启动自动生成，subject 为联系邮箱或站点地址
    // 关于社区：介绍正文与加入说明（纯文本，前台按段落渲染）
    "pushAnnounce",
    "aboutIntro",
    "aboutJoin",
    "vapidPublicKey",
    "vapidPrivateKey",
    "vapidSubject",
    "sidebarItems",
    "tabbarItems",
];

pub fn is_known(key: &str) -> bool {
    KEYS.contains(&key)
}

/// 环境变量 + 内置默认值
pub fn defaults(cfg: &Config) -> Map<String, Value> {
    let mut m = Map::new();
    let mut put = |k: &str, v: Value| {
        m.insert(k.to_string(), v);
    };
    put("siteName", json!(cfg.site_name));
    put("logoText", json!(""));
    put("logoImage", json!("/logo.png"));
    put("seoTitle", json!(""));
    put("seoDescription", json!(""));
    put("seoKeywords", json!(""));
    put("seoOgImage", json!(""));
    put("seoIndex", json!(true));
    put("seoVerification", json!(""));
    put("seoTwitter", json!(""));
    put(
        "publicBaseUrl",
        json!(cfg.public_base_url.clone().unwrap_or_default()),
    );
    put("geetestId", json!(cfg.geetest_id));
    put("geetestKey", json!(cfg.geetest_key));
    put("afdianUserId", json!(cfg.afdian_user_id));
    put("afdianToken", json!(cfg.afdian_token));
    put("afdianPageUrl", json!(cfg.afdian_page_url));
    put("githubClientId", json!(""));
    put("githubClientSecret", json!(""));
    put("cnkdClientId", json!(""));
    put("cnkdClientSecret", json!(""));
    put("footerText", json!(""));
    put("footerIcp", json!(""));
    put("footerLinks", json!(""));
    put("meGuestText", json!(""));
    put("loginHint", json!(""));
    put("registerHint", json!(""));
    put("loginPoints", json!(""));
    put("guildsHint", json!(""));
    put("teamsHint", json!(""));
    put("matchesHint", json!(""));
    put("serversHint", json!(""));
    put("resourcesHint", json!(""));
    put("devTeamsHint", json!(""));
    put("leaderboardHint", json!(""));
    put("pointsHint", json!(""));
    put("rewardsHint", json!(""));
    put("announcementsHint", json!(""));
    put("policiesHint", json!(""));
    put("allowRegister", json!(true));
    put("homeShowAnnouncements", json!(true));
    put("feedLayout", json!("list"));
    // 默认关闭：开启前必须先把 SMTP 配通，否则用户点「发送验证码」只会看到失败
    put("emailLoginEnabled", json!(false));
    put("smtpHost", json!(""));
    put("smtpPort", json!("465"));
    put("smtpUser", json!(""));
    put("smtpPass", json!(""));
    put("smtpFrom", json!(""));
    // true = 465 端口直连 TLS（implicit）；false = 587 端口 STARTTLS
    put("smtpSecure", json!(true));
    // 默认关闭审核，保持「发帖即发布」的现有体验
    put("postAuditMode", json!("off"));
    put("aiBaseUrl", json!(""));
    put("aiApiKey", json!(""));
    put("aiModel", json!("gpt-4o-mini"));
    put("aiPrompt", json!(""));
    put("pushAnnounce", json!(false));
    put("aboutIntro", json!(""));
    put("aboutJoin", json!(""));
    put("vapidPublicKey", json!(""));
    put("vapidPrivateKey", json!(""));
    put("vapidSubject", json!(""));
    put("sidebarItems", json!(""));
    put("tabbarItems", json!(""));
    m
}

/// 只取数据库里存过的覆盖项
pub async fn overrides(pool: &PgPool) -> Result<Map<String, Value>, sqlx::Error> {
    let rows: Vec<(String, Value)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await?;

    let mut out = Map::new();
    for (k, v) in rows {
        if is_known(&k) {
            out.insert(k, v);
        }
    }
    Ok(out)
}

/// 合并后的有效设置
pub async fn load(pool: &PgPool, cfg: &Config) -> Map<String, Value> {
    let mut merged = defaults(cfg);
    if let Ok(ov) = overrides(pool).await {
        for (k, v) in ov {
            merged.insert(k, v);
        }
    }
    merged
}

/// 写覆盖项（只收认识的键与字符串/布尔），返回合并后的结果
pub async fn update(
    pool: &PgPool,
    patch: &Map<String, Value>,
    cfg: &Config,
) -> Result<Map<String, Value>, sqlx::Error> {
    for (k, v) in patch {
        if !is_known(k) || !(v.is_string() || v.is_boolean()) {
            continue;
        }
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(k)
        .bind(v)
        .execute(pool)
        .await?;
    }
    Ok(load(pool, cfg).await)
}

/// 清掉某个覆盖项，回落到环境变量
pub async fn reset(
    pool: &PgPool,
    key: &str,
    cfg: &Config,
) -> Result<Map<String, Value>, sqlx::Error> {
    sqlx::query("DELETE FROM settings WHERE key = $1")
        .bind(key)
        .execute(pool)
        .await?;
    Ok(load(pool, cfg).await)
}

pub fn text(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

pub fn flag(map: &Map<String, Value>, key: &str, fallback: bool) -> bool {
    map.get(key).and_then(|v| v.as_bool()).unwrap_or(fallback)
}
