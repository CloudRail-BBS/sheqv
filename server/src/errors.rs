use axum::Json;
use axum::http::{HeaderName, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

/// 错误响应的唯一出口：`{ "error": "...", "message": "..." }`。
///
/// `error` 是稳定错误码（前端按它分支），`message` 是给人看的中文。
/// 新增错误码时**同时**在 `docs/前后端分离方案.md` §7 的红线表里登记，
/// 并在 Next 侧的错误映射表加一条，否则界面会退化成「未知错误」。
#[derive(Debug, thiserror::Error)]
#[error("{status}: {code}")]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: Option<String>,
    /// 少数接口需要额外响应头（如后台 401 的 WWW-Authenticate）
    pub headers: Vec<(HeaderName, String)>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str) -> Self {
        Self {
            status,
            code,
            message: None,
            headers: Vec::new(),
        }
    }

    pub fn with_message(
        status: StatusCode,
        code: &'static str,
        message: impl Into<String>,
    ) -> Self {
        Self {
            status,
            code,
            message: Some(message.into()),
            headers: Vec::new(),
        }
    }

    pub fn unauthorized() -> Self {
        Self::with_message(StatusCode::UNAUTHORIZED, "unauthorized", "需要登录后操作")
    }

    /// 未登录（与 Node 版 `need_login` 对齐）
    pub fn need_login() -> Self {
        Self::with_message(StatusCode::UNAUTHORIZED, "need_login", "请先登录")
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::with_message(StatusCode::UNPROCESSABLE_ENTITY, "invalid_input", message)
    }

    pub fn forbidden() -> Self {
        Self::with_message(StatusCode::FORBIDDEN, "forbidden", "没有权限")
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found")
    }

    /// 记录原始错误，对外只回错误码——不要把 SQL、路径、堆栈带给浏览器。
    pub fn internal(err: impl std::fmt::Display) -> Self {
        tracing::error!(error = %err, "内部错误");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "server_error")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut body = json!({ "error": self.code });
        if let Some(msg) = &self.message {
            body["message"] = json!(msg);
        }

        let mut res = (self.status, Json(body)).into_response();
        for (name, value) in self.headers {
            if let Ok(v) = value.parse() {
                res.headers_mut().insert(name, v);
            }
        }
        if !res.headers().contains_key(header::CONTENT_TYPE) {
            // Json 已设置，这里只是兜底
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                "application/json".parse().expect("固定值"),
            );
        }
        res
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
