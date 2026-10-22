use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::auth::session;
use crate::captcha::{self, CaptchaPayload, CaptchaResult};
use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::settings;
use crate::state::AppState;
use crate::users::{self, CreateError, RegisterInput};

#[derive(Deserialize)]
struct RegisterBody {
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    nickname: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    captcha: Option<CaptchaPayload>,
}

#[derive(Deserialize)]
struct LoginBody {
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    captcha: Option<CaptchaPayload>,
}

fn set_cookie_header(res: &mut Response, cookie: String) {
    if let Ok(value) = cookie.parse() {
        res.headers_mut().insert(header::SET_COOKIE, value);
    }
}

fn captcha_error(result: CaptchaResult) -> Option<ApiError> {
    match result {
        CaptchaResult::Pass | CaptchaResult::Skipped => None,
        CaptchaResult::Failed(reason) => {
            // 只把已知的三个码透出去，避免把上游的任意字符串当错误码
            let code = match reason.as_str() {
                "missing_captcha" => "missing_captcha",
                "captcha_unreachable" => "captcha_unreachable",
                _ => "captcha_failed",
            };
            Some(ApiError::with_message(
                StatusCode::FORBIDDEN,
                code,
                "人机验证未通过，请重新完成验证",
            ))
        }
    }
}

/// POST /api/v1/auth/register
/// body: { username, nickname, password, email?, captcha? }
pub async fn register(
    State(st): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<RegisterBody>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let s = settings::load(&st.pool, &st.cfg).await;
    if !settings::flag(&s, "allowRegister", true) {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "register_closed",
            "站点暂时关闭了注册",
        ));
    }

    let input = RegisterInput {
        username: payload.username.unwrap_or_default(),
        nickname: payload.nickname.unwrap_or_default(),
        password: payload.password.unwrap_or_default(),
        email: payload.email.unwrap_or_default(),
    };

    if let Some(msg) = users::validate_register(&input) {
        return Err(ApiError::invalid_input(msg));
    }

    let outcome = captcha::verify(&st.http, &st.cfg, &s, payload.captcha.as_ref()).await;
    if let Some(err) = captcha_error(outcome) {
        return Err(err);
    }

    match users::create(&st.pool, &input).await {
        Ok((user, became_admin)) => {
            let token = session::issue_token(
                st.session_secret.as_slice(),
                &user.id,
                chrono::Utc::now().timestamp(),
            );
            let mut res = (
                StatusCode::CREATED,
                Json(json!({ "ok": true, "user": user, "becameAdmin": became_admin })),
            )
                .into_response();
            set_cookie_header(
                &mut res,
                session::set_cookie(&token, session::is_secure(&headers)),
            );
            Ok(res)
        }
        Err(CreateError::UsernameTaken) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "username_taken",
            "该用户名已被占用",
        )),
        Err(CreateError::EmailTaken) => Err(ApiError::with_message(
            StatusCode::CONFLICT,
            "email_taken",
            "该邮箱已被其他账号使用",
        )),
        Err(CreateError::Invalid(msg)) => Err(ApiError::invalid_input(msg)),
        Err(CreateError::Db(err)) => Err(ApiError::internal(err)),
    }
}

/// POST /api/v1/auth/login  body: { username, password, captcha? }
pub async fn login(
    State(st): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Response> {
    let Ok(payload) = serde_json::from_slice::<LoginBody>(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let username = payload.username.unwrap_or_default();
    let password = payload.password.unwrap_or_default();
    if username.trim().is_empty() || password.is_empty() {
        return Err(ApiError::invalid_input("请填写用户名和密码"));
    }

    let s = settings::load(&st.pool, &st.cfg).await;
    let outcome = captcha::verify(&st.http, &st.cfg, &s, payload.captcha.as_ref()).await;
    if let Some(err) = captcha_error(outcome) {
        return Err(err);
    }

    let Some(user) = users::authenticate(&st.pool, &username, &password).await else {
        // 不区分「用户不存在」与「密码错误」
        return Err(ApiError::with_message(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
            "用户名或密码不正确",
        ));
    };

    if user.banned {
        return Err(ApiError::with_message(
            StatusCode::FORBIDDEN,
            "account_banned",
            "该账号已被封禁，请联系管理员",
        ));
    }

    let token = session::issue_token(
        st.session_secret.as_slice(),
        &user.id,
        chrono::Utc::now().timestamp(),
    );
    let mut res = Json(json!({ "ok": true, "user": user })).into_response();
    set_cookie_header(
        &mut res,
        session::set_cookie(&token, session::is_secure(&headers)),
    );
    Ok(res)
}

/// POST /api/v1/auth/logout —— 清会话 Cookie
pub async fn logout(headers: HeaderMap) -> Response {
    let mut res = Json(json!({ "ok": true })).into_response();
    set_cookie_header(
        &mut res,
        session::clear_cookie(session::is_secure(&headers)),
    );
    res
}

/// GET /api/v1/auth/state
/// 前端与冒烟脚本用它判断「是否已有账号」以及「当前是谁」
pub async fn state(State(st): State<AppState>, MaybeUser(maybe): MaybeUser) -> ApiResult<Response> {
    let total = users::count(&st.pool).await.map_err(ApiError::internal)?;

    let mut res = Json(json!({
        "initialized": total > 0,
        "userCount": total,
        "user": maybe,
    }))
    .into_response();
    res.headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().expect("固定值"));
    Ok(res)
}
