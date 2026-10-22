//! 爱发电开放 API：只依赖 `user_id` + `token`，表单签名 md5。
//!
//! 签名：`md5(token + "params" + params + "ts" + ts + "user_id" + user_id)`
//! 接口：`POST https://afdian.com/api/open/query-sponsor`，每页 20，最多 10 页。

use md5::{Digest, Md5};
use reqwest::Client;
use serde_json::{Value, json};

#[derive(Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub amount: f64,
    pub plan_title: Option<String>,
    pub first_at: Option<i64>,
    pub last_pay_at: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum AfdianError {
    #[error("未配置爱发电 user_id / token（可在后台「站点设置」填写）")]
    NotConfigured,
    #[error("连不上爱发电接口（网络或超时）")]
    Unreachable,
    #[error("爱发电返回 HTTP {0}")]
    Http(u16),
    #[error("爱发电返回的不是合法 JSON")]
    BadResponse,
    #[error("{0}")]
    Api(String),
}

pub fn sign_params(params: &str, ts: &str, user_id: &str, token: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("{token}params{params}ts{ts}user_id{user_id}").as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(32);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

async fn request(
    http: &Client,
    path: &str,
    params: Value,
    user_id: &str,
    token: &str,
) -> Result<Value, AfdianError> {
    if user_id.is_empty() || token.is_empty() {
        return Err(AfdianError::NotConfigured);
    }

    let body = serde_json::to_string(&params).unwrap_or_else(|_| "{}".to_string());
    let ts = chrono::Utc::now().timestamp().to_string();
    let sign = sign_params(&body, &ts, user_id, token);

    let form = [
        ("user_id", user_id),
        ("params", body.as_str()),
        ("ts", ts.as_str()),
        ("sign", sign.as_str()),
    ];

    let resp = http
        .post(format!("https://afdian.com{path}"))
        .timeout(std::time::Duration::from_secs(8))
        .form(&form)
        .send()
        .await
        .map_err(|_| AfdianError::Unreachable)?;

    if !resp.status().is_success() {
        return Err(AfdianError::Http(resp.status().as_u16()));
    }

    let data: Value = resp.json().await.map_err(|_| AfdianError::BadResponse)?;
    if data["ec"].as_i64() != Some(200) {
        let msg = data["em"]
            .as_str()
            .unwrap_or("爱发电接口返回异常")
            .to_string();
        return Err(AfdianError::Api(msg));
    }

    Ok(data["data"].clone())
}

/// 连通性与鉴权自检
pub async fn ping(http: &Client, user_id: &str, token: &str) -> Result<(), AfdianError> {
    request(http, "/api/open/misc/ping", json!({}), user_id, token).await?;
    Ok(())
}

/// 拉赞助者（自动翻页，最多 `max_pages`）
pub async fn fetch_sponsors(
    http: &Client,
    user_id: &str,
    token: &str,
    max_pages: usize,
) -> Result<(Vec<Entry>, i64), AfdianError> {
    let mut all = Vec::new();
    let mut total = 0i64;

    for page in 1..=max_pages.max(1) {
        let data = request(
            http,
            "/api/open/query-sponsor",
            json!({ "page": page, "per_page": 20 }),
            user_id,
            token,
        )
        .await?;

        let list = data["list"].as_array().cloned().unwrap_or_default();
        if list.is_empty() {
            break;
        }

        for item in &list {
            let user = &item["user"];
            let Some(id) = user["user_id"].as_str().filter(|v| !v.is_empty()) else {
                continue;
            };
            all.push(Entry {
                id: id.to_string(),
                name: user["name"].as_str().unwrap_or("匿名赞助者").to_string(),
                avatar: user["avatar"].as_str().map(str::to_string),
                amount: item["all_sum_amount"]
                    .as_str()
                    .and_then(|v| v.parse::<f64>().ok())
                    .or_else(|| item["all_sum_amount"].as_f64())
                    .unwrap_or(0.0),
                plan_title: item["current_plan"]["plan_title"]
                    .as_str()
                    .map(str::to_string),
                first_at: item["create_time"].as_i64(),
                last_pay_at: item["last_pay_time"].as_i64(),
            });
        }

        let pages = data["total_page"].as_i64().unwrap_or(1).max(1);
        total = data["total_count"].as_i64().unwrap_or(all.len() as i64);
        if page as i64 >= pages {
            break;
        }
    }

    Ok((all, total))
}
