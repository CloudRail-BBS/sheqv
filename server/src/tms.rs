//! 腾讯云内容安全（TMS，文本内容安全）客户端。
//!
//! 只实现一个动作：`TextModeration`（[文档](https://cloud.tencent.com/document/product/1124/37115)）。
//! 签名是腾讯云统一的 TC3-HMAC-SHA256：先拼规范请求，再逐级派生签名密钥，
//! 与 AWS SigV4 同构，参数顺序错一个就会 `AuthFailure.SignatureFailure`。
//!
//! 密钥只在服务端使用，**不落库明文日志**：出错时只记录 RequestId 与状态码。

use std::time::Duration;

use hmac::{Hmac, Mac};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

use crate::settings;

type HmacSha256 = Hmac<Sha256>;

const HOST: &str = "tms.tencentcloudapi.com";
const SERVICE: &str = "tms";
const ACTION: &str = "TextModeration";
const VERSION: &str = "2020-12-29";

#[derive(Debug, Clone)]
pub struct TmsConfig {
    pub secret_id: String,
    pub secret_key: String,
    pub region: String,
    /// 自定义业务策略（后台配置的 BizType），留空走默认策略
    pub biz_type: String,
}

pub fn config(s: &Map<String, Value>) -> Option<TmsConfig> {
    let secret_id = settings::text(s, "tmsSecretId").trim().to_string();
    let secret_key = settings::text(s, "tmsSecretKey").trim().to_string();
    if secret_id.is_empty() || secret_key.is_empty() {
        return None;
    }
    let region = {
        let r = settings::text(s, "tmsRegion").trim().to_string();
        if r.is_empty() {
            "ap-guangzhou".to_string()
        } else {
            r
        }
    };
    Some(TmsConfig {
        secret_id,
        secret_key,
        region,
        biz_type: settings::text(s, "tmsBizType").trim().to_string(),
    })
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    hex(&h.finalize())
}

fn hmac(key: &[u8], msg: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC 接受任意长度密钥");
    mac.update(msg.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// 生成 Authorization 头。抽出函数方便单测（签名是纯函数，不依赖网络）。
fn authorization(cfg: &TmsConfig, payload: &str, timestamp: i64) -> String {
    let date = chrono::DateTime::from_timestamp(timestamp, 0)
        .unwrap_or_else(chrono::Utc::now)
        .format("%Y-%m-%d")
        .to_string();

    // 1. 规范请求
    let canonical_headers = format!(
        "content-type:application/json; charset=utf-8\nhost:{HOST}\nx-tc-action:{}\n",
        ACTION.to_lowercase()
    );
    let signed_headers = "content-type;host;x-tc-action";
    let canonical_request = format!(
        "POST\n/\n\n{canonical_headers}\n{signed_headers}\n{}",
        sha256_hex(payload.as_bytes())
    );

    // 2. 待签字符串
    let credential_scope = format!("{date}/{SERVICE}/tc3_request");
    let string_to_sign = format!(
        "TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );

    // 3. 逐级派生密钥
    let secret_date = hmac(format!("TC3{}", cfg.secret_key).as_bytes(), &date);
    let secret_service = hmac(&secret_date, SERVICE);
    let secret_signing = hmac(&secret_service, "tc3_request");
    let signature = hex(&hmac(&secret_signing, &string_to_sign));

    format!(
        "TC3-HMAC-SHA256 Credential={}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}",
        cfg.secret_id
    )
}

/// 审核一段文本。返回 `Ok(())` 表示通过；`Ok(Some(原因))` 表示需要人工/拦截。
///
/// 调用失败返回 `Err`，由上层决定「保守进待审」。
pub async fn moderate(
    http: &reqwest::Client,
    cfg: &TmsConfig,
    title: &str,
    body: &str,
) -> Result<Option<String>, String> {
    // TMS 单次上限 10000 字符，标题 + 正文拼起来截断，避免请求被拒
    let content: String = format!("{title}\n{body}").chars().take(9000).collect();
    let mut payload = json!({ "Content": content });
    if !cfg.biz_type.is_empty() {
        payload["BizType"] = json!(cfg.biz_type);
    }
    let payload = payload.to_string();
    let timestamp = chrono::Utc::now().timestamp();

    let resp = http
        .post(format!("https://{HOST}"))
        .header("Authorization", authorization(cfg, &payload, timestamp))
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Host", HOST)
        .header("X-TC-Action", ACTION)
        .header("X-TC-Version", VERSION)
        .header("X-TC-Timestamp", timestamp.to_string())
        .header("X-TC-Region", &cfg.region)
        .timeout(Duration::from_secs(10))
        .body(payload)
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取响应失败：{e}"))?;
    let parsed: Value =
        serde_json::from_str(&text).map_err(|_| format!("响应不是 JSON（HTTP {status}）"))?;

    let res = &parsed["Response"];
    if let Some(err) = res.get("Error") {
        let code = err["Code"].as_str().unwrap_or("Unknown");
        let message = err["Message"].as_str().unwrap_or("");
        return Err(format!("TMS {code}：{message}"));
    }

    let label = res["Label"].as_str().unwrap_or("Normal");
    let suggestion = res["Suggestion"].as_str().unwrap_or("Pass");
    if suggestion == "Pass" && (label == "Normal" || label.is_empty()) {
        return Ok(None);
    }

    let keywords: Vec<&str> = res["Keywords"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    let reason = if keywords.is_empty() {
        format!("腾讯云内容安全判定：{label}（{suggestion}）")
    } else {
        format!(
            "腾讯云内容安全判定：{label}（{suggestion}），命中：{}",
            keywords.join("、")
        )
    };
    Ok(Some(reason))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_is_stable_for_fixed_input() {
        let cfg = TmsConfig {
            secret_id: "AKIDEXAMPLE".into(),
            secret_key: "SECRETEXAMPLE".into(),
            region: "ap-guangzhou".into(),
            biz_type: String::new(),
        };
        // 同一输入必须得到同一签名（纯函数，不含随机量）
        let a = authorization(&cfg, "{\"Content\":\"hi\"}", 1_700_000_000);
        let b = authorization(&cfg, "{\"Content\":\"hi\"}", 1_700_000_000);
        assert_eq!(a, b);
        assert!(a.starts_with("TC3-HMAC-SHA256 Credential=AKIDEXAMPLE/"));
        assert!(a.contains("/tms/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature="));
    }

    #[test]
    fn hex_encodes_lowercase() {
        assert_eq!(hex(&[0x00, 0x0f, 0xff]), "000fff");
    }
}
