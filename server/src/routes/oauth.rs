use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value};

use crate::auth::session;
use crate::oauth::{self, Provider};
use crate::state::AppState;
use crate::{settings, users};

/// 对外地址：后台设置 > 环境变量 > 请求头推导
fn base_url(st: &AppState, s: &Map<String, Value>, headers: &HeaderMap) -> String {
    let from_admin = settings::text(s, "publicBaseUrl");
    if !from_admin.is_empty() {
        return from_admin.trim_end_matches('/').to_string();
    }
    if let Some(base) = &st.cfg.public_base_url {
        return base.trim_end_matches('/').to_string();
    }

    let proto = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or("http");
    let host = headers
        .get("x-forwarded-host")
        .or_else(|| headers.get(header::HOST))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost");
    format!("{proto}://{host}")
}

fn redirect(location: &str) -> Response {
    (
        StatusCode::FOUND,
        [(header::LOCATION, location.to_string())],
    )
        .into_response()
}

fn push_cookie(res: &mut Response, value: String) {
    if let Ok(v) = value.parse() {
        res.headers_mut().append(header::SET_COOKIE, v);
    }
}

fn transient_cookie(name: &str, value: &str, secure: bool) -> String {
    let mut out = format!(
        "{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        oauth::TTL_SECS
    );
    if secure {
        out.push_str("; Secure");
    }
    out
}

fn clear_cookie(name: &str, secure: bool) -> String {
    let mut out = format!("{name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    if secure {
        out.push_str("; Secure");
    }
    out
}

fn provider_enabled(p: Provider, s: &Map<String, Value>) -> bool {
    match p {
        Provider::Github => {
            !settings::text(s, "githubClientId").is_empty()
                && !settings::text(s, "githubClientSecret").is_empty()
        }
        Provider::Cnkd => {
            !settings::text(s, "cnkdClientId").is_empty()
                && !settings::text(s, "cnkdClientSecret").is_empty()
        }
        Provider::Czl => {
            !settings::text(s, "czlClientId").is_empty()
                && !settings::text(s, "czlClientSecret").is_empty()
        }
    }
}

/// GET /api/v1/auth/oauth/:provider
pub async fn start(
    State(st): State<AppState>,
    Path(raw): Path<String>,
    headers: HeaderMap,
) -> Response {
    let s = settings::load(&st.pool, &st.cfg).await;
    let base = base_url(&st, &s, &headers);

    let Some(p) = Provider::parse(&raw) else {
        return redirect(&format!("{base}/login?error=unknown_provider"));
    };
    if !provider_enabled(p, &s) {
        return redirect(&format!(
            "{base}/login?error=provider_disabled&provider={}",
            p.as_str()
        ));
    }

    let client_id = match p {
        Provider::Github => settings::text(&s, "githubClientId"),
        Provider::Cnkd => settings::text(&s, "cnkdClientId"),
        Provider::Czl => settings::text(&s, "czlClientId"),
    };

    let state = oauth::create_state();
    let (verifier, challenge) = oauth::create_pkce();
    let target = oauth::authorize_url(
        p,
        &client_id,
        &oauth::callback_url(&base, p),
        &state,
        &challenge,
    );

    let secure = session::is_secure(&headers);
    let mut res = redirect(&target);
    push_cookie(
        &mut res,
        transient_cookie(
            oauth::STATE_COOKIE,
            &format!("{}.{}", p.as_str(), state),
            secure,
        ),
    );
    push_cookie(
        &mut res,
        transient_cookie(
            oauth::VERIFIER_COOKIE,
            &format!("{}.{}", p.as_str(), verifier),
            secure,
        ),
    );
    res
}

/// GET /api/v1/auth/oauth/:provider/callback
pub async fn callback(
    State(st): State<AppState>,
    Path(raw): Path<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let s = settings::load(&st.pool, &st.cfg).await;
    let base = base_url(&st, &s, &headers);
    let fail = |code: &str| redirect(&format!("{base}/login?error={code}"));

    let Some(p) = Provider::parse(&raw) else {
        return fail("unknown_provider");
    };
    if !provider_enabled(p, &s) {
        return fail("provider_disabled");
    }
    if q.get("error").is_some_and(|v| !v.is_empty()) {
        return fail("access_denied");
    }

    let code = q.get("code").cloned().unwrap_or_default();
    let state = q.get("state").cloned().unwrap_or_default();
    let cookie_state = session::cookie_value(&headers, oauth::STATE_COOKIE).unwrap_or_default();
    let cookie_verifier =
        session::cookie_value(&headers, oauth::VERIFIER_COOKIE).unwrap_or_default();

    // state 必须与 Cookie 一致，且 provider 对得上
    let (state_provider, state_value) = cookie_state.split_once('.').unwrap_or_default();
    if code.is_empty()
        || state.is_empty()
        || state_provider != p.as_str()
        || state_value.is_empty()
        || state_value != state
    {
        return fail("state_mismatch");
    }

    let (verifier_provider, verifier) = cookie_verifier.split_once('.').unwrap_or_default();
    if verifier_provider != p.as_str() || verifier.is_empty() {
        return fail("missing_pkce");
    }

    let (client_id, client_secret) = match p {
        Provider::Github => (
            settings::text(&s, "githubClientId"),
            settings::text(&s, "githubClientSecret"),
        ),
        Provider::Cnkd => (
            settings::text(&s, "cnkdClientId"),
            settings::text(&s, "cnkdClientSecret"),
        ),
        Provider::Czl => (
            settings::text(&s, "czlClientId"),
            settings::text(&s, "czlClientSecret"),
        ),
    };
    let redirect_uri = oauth::callback_url(&base, p);

    let access_token = match oauth::exchange_code(
        &st.http,
        p,
        &client_id,
        &client_secret,
        &code,
        &redirect_uri,
        verifier,
    )
    .await
    {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!(error = %e, "OAuth 换 token 失败");
            return fail("exchange_failed");
        }
    };

    let profile = match oauth::fetch_profile(&st.http, p, &access_token).await {
        Ok(p) => p,
        Err(e) => return fail(e.code()),
    };

    // 注册开关只拦「新建账号」，已绑定的老用户照常登录
    match users::find_by_identity(&st.pool, p.as_str(), &profile.sub).await {
        Ok(Some(_)) => {}
        Ok(None) => {
            if !settings::flag(&s, "allowRegister", true) {
                return fail("register_closed");
            }
        }
        Err(err) => {
            tracing::error!(error = %err, "查询第三方身份失败");
            return fail("oauth_failed");
        }
    }

    let (user, created) = match users::upsert_social(&st.pool, p.as_str(), &profile).await {
        Ok(v) => v,
        Err(err) => {
            tracing::error!(error = %err, "第三方建号失败");
            return fail("create_failed");
        }
    };

    if user.banned {
        return fail("account_banned");
    }

    let token = session::issue_token(
        st.session_secret.as_slice(),
        &user.id,
        chrono::Utc::now().timestamp(),
    );
    let secure = session::is_secure(&headers);

    let mut res = redirect(&format!(
        "{base}/me{}",
        if created { "?welcome=1" } else { "" }
    ));
    push_cookie(&mut res, session::set_cookie(&token, secure));
    // 一次性 Cookie 用完即弃
    push_cookie(&mut res, clear_cookie(oauth::STATE_COOKIE, secure));
    push_cookie(&mut res, clear_cookie(oauth::VERIFIER_COOKIE, secure));
    res
}
