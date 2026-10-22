//! GeeTest v4 服务端二次校验。
//!
//! 客户端拿到的只是「人完成了拼图」，票据仍要拿到 `gcaptcha4/validate` 换结论。
//! 网络失败默认**拒绝**，只有显式配置 `GEETEST_BYPASS_ON_ERROR=1` 才放行。

use hmac::{Hmac, Mac};
use reqwest::Url;
use serde::Deserialize;
use serde_json::{Map, Value};
use sha2::Sha256;

use crate::config::Config;
use crate::settings;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct CaptchaPayload {
    #[serde(default)]
    pub lot_number: Option<String>,
    #[serde(default)]
    pub captcha_output: Option<String>,
    #[serde(default)]
    pub pass_token: Option<String>,
    #[serde(default)]
    pub gen_time: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum CaptchaResult {
    /// 校验通过
    Pass,
    /// 站点没配 id + key，或开了宕机模式
    Skipped,
    /// 失败，附错误码（会原样回给前端）
    Failed(String),
}

pub async fn verify(
    http: &reqwest::Client,
    cfg: &Config,
    settings: &Map<String, Value>,
    payload: Option<&CaptchaPayload>,
) -> CaptchaResult {
    let id = settings::text(settings, "geetestId");
    let key = settings::text(settings, "geetestKey");
    if id.is_empty() || key.is_empty() {
        return CaptchaResult::Skipped;
    }

    let Some(p) = payload else {
        return CaptchaResult::Failed("missing_captcha".into());
    };
    let trim = |v: &Option<String>| {
        v.as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let (Some(lot), Some(output), Some(pass_token), Some(gen_time)) = (
        trim(&p.lot_number),
        trim(&p.captcha_output),
        trim(&p.pass_token),
        trim(&p.gen_time),
    ) else {
        return CaptchaResult::Failed("missing_captcha".into());
    };

    let mut mac = HmacSha256::new_from_slice(key.as_bytes()).expect("HMAC 接受任意长度密钥");
    mac.update(lot.as_bytes());
    let sign_token = hex(mac.finalize().into_bytes().as_slice());

    let mut url = Url::parse("https://gcaptcha4.geetest.com/validate").expect("固定地址");
    url.query_pairs_mut().append_pair("captcha_id", &id);

    let form = [
        ("lot_number", lot.as_str()),
        ("captcha_output", output.as_str()),
        ("pass_token", pass_token.as_str()),
        ("gen_time", gen_time.as_str()),
        ("sign_token", sign_token.as_str()),
    ];

    match http.post(url).form(&form).send().await {
        Ok(resp) => {
            let data: Value = resp.json().await.unwrap_or(Value::Null);
            if data["status"] == "success" && data["result"] == "success" {
                CaptchaResult::Pass
            } else {
                let reason = data["reason"]
                    .as_str()
                    .unwrap_or("captcha_failed")
                    .to_string();
                CaptchaResult::Failed(reason)
            }
        }
        Err(err) => {
            tracing::warn!(error = %err, "GeeTest 校验接口不可达");
            if cfg.geetest_bypass_on_error {
                CaptchaResult::Skipped
            } else {
                CaptchaResult::Failed("captcha_unreachable".into())
            }
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}
