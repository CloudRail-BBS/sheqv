//! SMTP 发信。当前只服务于「邮箱验证码登录」。
//!
//! 为什么要自己建连接而不是走 HTTP 邮件 API：自托管场景下用户手里通常是
//! QQ 邮箱 / 163 / 企业邮箱的 SMTP 授权码，SMTP 是最通用的一种，不绑定服务商。
//!
//! 配置全部来自后台设置（`smtpHost` / `smtpPort` / `smtpUser` / `smtpPass` /
//! `smtpFrom` / `smtpSecure`），**不读环境变量**——与其它业务配置保持一致。

use std::time::Duration;

use lettre::message::{Mailbox, header::ContentType};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde_json::{Map, Value};

use crate::settings;

#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub pass: String,
    pub from: String,
    /// true = 直连 TLS（一般 465）；false = STARTTLS（一般 587）
    pub secure: bool,
}

impl SmtpConfig {
    /// 配置是否足以发信
    pub fn is_complete(&self) -> bool {
        !self.host.is_empty() && !self.from.is_empty()
    }
}

/// 从合并后的设置里读 SMTP 配置；缺关键项返回 None
pub fn from_settings(s: &Map<String, Value>) -> Option<SmtpConfig> {
    let host = settings::text(s, "smtpHost").trim().to_string();
    let user = settings::text(s, "smtpUser").trim().to_string();
    let pass = settings::text(s, "smtpPass");
    let mut from = settings::text(s, "smtpFrom").trim().to_string();

    // 没填发件人时退回登录账号：多数服务商要求 From 与账号同域
    if from.is_empty() {
        from = user.clone();
    }

    let cfg = SmtpConfig {
        host,
        port: settings::text(s, "smtpPort").trim().parse().unwrap_or(465),
        user,
        pass,
        from,
        secure: settings::flag(s, "smtpSecure", true),
    };

    cfg.is_complete().then_some(cfg)
}

fn mailbox(raw: &str) -> Result<Mailbox, String> {
    raw.parse::<Mailbox>()
        .map_err(|e| format!("地址不合法（{raw}）：{e}"))
}

/// 发一封纯文本验证码邮件。
///
/// **不要把返回的错误原样带回浏览器**：里面可能包含服务器地址与账号信息，
/// 路由层只回一句「发送失败，请稍后再试」，细节进日志。
pub async fn send_code(
    cfg: &SmtpConfig,
    to: &str,
    code: &str,
    site_name: &str,
) -> Result<(), String> {
    let from = mailbox(&cfg.from)?;
    let to_box = mailbox(to)?;

    let body = format!(
        "你正在登录 {site_name}，验证码是：\n\n    {code}\n\n\
         10 分钟内有效，只能使用一次。\n\
         如果不是你本人操作，忽略这封邮件即可，你的账号不会有任何变化。\n"
    );

    let message = Message::builder()
        .from(from)
        .to(to_box)
        .subject(format!("{site_name} 登录验证码"))
        .header(ContentType::TEXT_PLAIN)
        .body(body)
        .map_err(|e| format!("组装邮件失败：{e}"))?;

    let builder = if cfg.secure {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.host)
    }
    .map_err(|e| format!("初始化 SMTP 失败：{e}"))?;

    let mut builder = builder
        .port(cfg.port)
        .timeout(Some(Duration::from_secs(15)));
    if !cfg.user.is_empty() {
        builder = builder.credentials(Credentials::new(cfg.user.clone(), cfg.pass.clone()));
    }

    builder
        .build()
        .send(message)
        .await
        .map_err(|e| format!("发送失败：{e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, Value)]) -> Map<String, Value> {
        let mut m = Map::new();
        for (k, v) in pairs {
            m.insert((*k).to_string(), v.clone());
        }
        m
    }

    #[test]
    fn missing_host_means_not_configured() {
        assert!(from_settings(&map(&[("smtpFrom", Value::String("a@b.c".into()))])).is_none());
    }

    #[test]
    fn falls_back_to_user_as_from() {
        let cfg = from_settings(&map(&[
            ("smtpHost", Value::String("smtp.example.com".into())),
            ("smtpUser", Value::String("bot@example.com".into())),
        ]))
        .expect("应视为已配置");
        assert_eq!(cfg.from, "bot@example.com");
        assert_eq!(cfg.port, 465);
        assert!(cfg.secure);
    }

    #[test]
    fn secure_flag_can_be_turned_off() {
        let cfg = from_settings(&map(&[
            ("smtpHost", Value::String("smtp.example.com".into())),
            ("smtpFrom", Value::String("a@b.c".into())),
            ("smtpSecure", Value::Bool(false)),
            ("smtpPort", Value::String("587".into())),
        ]))
        .expect("应视为已配置");
        assert!(!cfg.secure);
        assert_eq!(cfg.port, 587);
    }
}
