//! 邮箱验证码登录的两个接口。
//!
//! 与密码登录并列，不是替代：账号有邮箱 + 站点开了开关 + SMTP 配通 才可用。

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::auth::session;
use crate::email_login::{self, Throttle, Verify};
use crate::errors::{ApiError, ApiResult};
use crate::state::AppState;
use crate::{mailer, settings, users};

#[derive(Deserialize)]
struct EmailBody {
    #[serde(default)]
    email: Option<String>,
}

#[derive(Deserialize)]
struct CodeBody {
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    code: Option<String>,
}

/// 全局兜底：任何来源每分钟最多 30 封，防止换着邮箱把 SMTP 打爆
const GLOBAL_PER_MINUTE: i64 = 30;

fn client_ip(headers: &HeaderMap) -> Option<String> {
    for key in ["x-forwarded-for", "x-real-ip"] {
        if let Some(v) = headers.get(key).and_then(|v| v.to_str().ok()) {
            // XFF 可能是 "client, proxy1, proxy2"，取第一个
            if let Some(first) = v.split(',').next() {
                let ip = first.trim();
                if !ip.is_empty() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    None
}

/// POST /api/v1/auth/email-code  body: `{ email }`
///
/// 无论邮箱是否存在都返回相同的成功文案（防枚举）；真正没注册的只是不发信。
pub async fn send_code(
    State(st): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<EmailBody>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let s = settings::load(&st.pool, &st.cfg).await;
    if !settings::flag(&s, "emailLoginEnabled", false) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "email_login_disabled",
            "本站未开启邮箱验证码登录",
        ));
    }

    let Some(smtp) = mailer::from_settings(&s) else {
        // 这是管理员的配置问题，明确告诉前端，别让用户以为是自己的邮箱错了
        return Err(ApiError::with_message(
            StatusCode::SERVICE_UNAVAILABLE,
            "smtp_not_configured",
            "站点尚未配置发信服务，请联系管理员",
        ));
    };

    let raw = payload.email.unwrap_or_default();
    let Some(email) = users::normalize_email(&raw) else {
        return Err(ApiError::invalid_input("邮箱格式不正确"));
    };

    // 全局频控：统计最近一分钟的发送量
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM email_codes WHERE created_at > now() - interval '1 minute'",
    )
    .fetch_one(&st.pool)
    .await
    .map_err(ApiError::internal)?;
    if recent >= GLOBAL_PER_MINUTE {
        return Err(ApiError::with_message(
            StatusCode::TOO_MANY_REQUESTS,
            "too_many_requests",
            "发送过于频繁，请稍后再试",
        ));
    }

    let ok_body = || {
        Json(json!({
            "ok": true,
            "message": "如果该邮箱已注册，验证码已发送，10 分钟内有效",
            "retryAfter": email_login::RESEND_SECONDS,
        }))
        .into_response()
    };

    // 账号不存在：走同样的响应，但不发信、不写库
    let Some(user) = users::find_by_email(&st.pool, &email)
        .await
        .map_err(ApiError::internal)?
    else {
        return Ok(ok_body());
    };
    if user.banned {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "account_banned",
            "该账号已被封禁，请联系管理员",
        ));
    }

    match email_login::check_throttle(&st.pool, &email)
        .await
        .map_err(ApiError::internal)?
    {
        Throttle::Ok => {}
        Throttle::TooSoon(secs) => {
            return Err(ApiError::with_message(
                StatusCode::TOO_MANY_REQUESTS,
                "too_soon",
                format!("请 {secs} 秒后再试"),
            ));
        }
        Throttle::TooMany => {
            return Err(ApiError::with_message(
                StatusCode::TOO_MANY_REQUESTS,
                "too_many_requests",
                "该邮箱今日发送次数过多，请稍后再试",
            ));
        }
    }

    let code = email_login::gen_code();
    let hash = email_login::hash_code(st.session_secret.as_slice(), &email, &code);
    let ip = client_ip(&headers);
    let id = email_login::issue(&st.pool, &email, &hash, ip.as_deref())
        .await
        .map_err(ApiError::internal)?;

    let site_name = {
        let name = settings::text(&s, "siteName");
        if name.is_empty() {
            "方块竞技场".to_string()
        } else {
            name
        }
    };

    if let Err(err) = mailer::send_code(&smtp, &email, &code, &site_name).await {
        // 细节只进日志：里面可能含服务器地址与账号
        tracing::error!(error = %err, "发送验证码失败");
        email_login::discard(&st.pool, &id).await;
        return Err(ApiError::with_message(
            StatusCode::BAD_GATEWAY,
            "email_send_failed",
            "验证码发送失败，请稍后再试",
        ));
    }

    Ok(ok_body())
}

/// POST /api/v1/auth/email-login  body: `{ email, code }`
pub async fn login(
    State(st): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<CodeBody>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let s = settings::load(&st.pool, &st.cfg).await;
    if !settings::flag(&s, "emailLoginEnabled", false) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "email_login_disabled",
            "本站未开启邮箱验证码登录",
        ));
    }

    let raw_email = payload.email.unwrap_or_default();
    let Some(email) = users::normalize_email(&raw_email) else {
        return Err(ApiError::invalid_input("邮箱格式不正确"));
    };

    let code = payload.code.unwrap_or_default().trim().to_string();
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::invalid_input("验证码为 6 位数字"));
    }

    // 验证码错误统一一个错误码，不区分「过期 / 输错 / 已用过」，避免给枚举者信息
    let invalid = || {
        ApiError::with_message(
            StatusCode::UNAUTHORIZED,
            "invalid_code",
            "验证码不正确或已过期，请重新获取",
        )
    };

    match email_login::verify(&st.pool, st.session_secret.as_slice(), &email, &code)
        .await
        .map_err(ApiError::internal)?
    {
        Verify::Ok => {}
        Verify::NoCode | Verify::Wrong | Verify::TooManyAttempts => return Err(invalid()),
    }

    let Some(row) = users::find_by_email(&st.pool, &email)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(invalid());
    };
    if row.banned {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "account_banned",
            "该账号已被封禁，请联系管理员",
        ));
    }

    users::touch_login(&st.pool, &row.id).await;

    let token = session::issue_token(
        st.session_secret.as_slice(),
        &row.id,
        chrono::Utc::now().timestamp(),
    );
    let mut res = Json(json!({ "ok": true, "user": row.to_public() })).into_response();
    crate::routes::auth::set_cookie_header(
        &mut res,
        session::set_cookie(&token, session::is_secure(&headers)),
    );
    Ok(res)
}
