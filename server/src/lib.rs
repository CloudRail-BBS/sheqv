//! 方块竞技场后端（axum + PostgreSQL）。
//!
//! 模块划分：
//! - `config`       进程参数与密钥（环境变量）
//! - `settings`     业务配置（表 > 环境变量 > 默认）
//! - `db`           连接池与迁移
//! - `auth`         密码哈希、会话签名（必须与 Node 版逐字节兼容）
//! - `current_user` 会话 Cookie → 当前用户（提取器）
//! - `users`        用户仓库与注册校验
//! - `forum`        帖子 / 评论 / 点赞
//! - `agreements`   公约与签署
//! - `notifications` 站内信聚合
//! - `captcha`      GeeTest v4 服务端校验
//! - `routes`       HTTP 接口
//! - `errors`       错误码与中文文案的唯一出口

pub mod achievements;
pub mod admin_auth;
pub mod afdian;
pub mod agreements;
pub mod announcements;
pub mod audit;
pub mod auth;
pub mod captcha;
pub mod changelog;
pub mod config;
pub mod current_user;
pub mod db;
pub mod email_login;
pub mod errors;
pub mod forum;
pub mod groups;
pub mod ids;
pub mod mailer;
pub mod mcping;
pub mod netcheck;
pub mod notifications;
pub mod orgs;
pub mod oauth;
pub mod relay;
pub mod routes;
pub mod servers;
pub mod settings;
pub mod slides;
pub mod sponsors;
pub mod state;
pub mod users;
