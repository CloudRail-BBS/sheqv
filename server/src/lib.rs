//! 方块竞技场后端（axum + PostgreSQL）。
//!
//! 模块划分：
//! - `config`  进程参数与密钥（环境变量），业务配置后续从 `settings` 表读
//! - `db`      连接池与迁移
//! - `auth`    密码哈希、会话签名（必须与 Node 版逐字节兼容）
//! - `routes`  HTTP 接口
//! - `errors`  错误码与中文文案的唯一出口

pub mod auth;
pub mod config;
pub mod db;
pub mod errors;
pub mod routes;
pub mod state;
