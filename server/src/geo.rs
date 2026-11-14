//! IP 归属地：发帖 / 评论时记一次省份，详情页显示「IP:山东」。
//!
//! 只存归属地、不存原始 IP —— 够展示，也少存一条个人信息。
//! 查询走 ip-api 的免费接口（免 key，中文地名），失败就当没有：
//! 归属地是装饰信息，不能因为它拖慢发布，更不能因为查不到就不让发。

use std::net::IpAddr;
use std::time::Duration;

use axum::http::HeaderMap;

/// 从代理头里取真实客户端 IP。
///
/// 站点部署在 nginx / docker 后面，`remote_addr` 拿到的是反代地址，
/// 所以优先读 `X-Forwarded-For`（第一段是客户端），其次 `X-Real-IP`。
/// 取不到就返回 None：详情页不显示归属地，而不是瞎猜一个。
pub fn client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    for key in ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"] {
        let Some(raw) = headers.get(key).and_then(|v| v.to_str().ok()) else {
            continue;
        };
        for part in raw.split(',') {
            if let Ok(ip) = part.trim().parse::<IpAddr>() {
                return Some(ip);
            }
        }
    }
    None
}

fn is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified()
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
    }
}

/// 查归属地：国内给省份（北京 / 山东 / 内蒙古），国外给国家名。
///
/// 局域网与内网地址直接标「本地」，省一次网络请求。
pub async fn region(http: &reqwest::Client, ip: Option<IpAddr>) -> Option<String> {
    let ip = ip?;
    if is_private(&ip) {
        return Some("本地".to_string());
    }

    let url = format!("http://ip-api.com/json/{ip}?lang=zh-CN&fields=status,country,regionName");
    // 免费接口通常在 100ms 内返回；给它 800ms，超时就不要了
    let res = http.get(url).timeout(Duration::from_millis(800)).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let v: serde_json::Value = res.json().await.ok()?;
    if v.get("status").and_then(|s| s.as_str()) != Some("success") {
        return None;
    }

    let country = v.get("country").and_then(|s| s.as_str()).unwrap_or("").trim();
    let region = v.get("regionName").and_then(|s| s.as_str()).unwrap_or("").trim();
    // 国内只留省份（「黑龙江省」→「黑龙江」）；国外没有省份概念，用国家名
    let text = if country == "中国" {
        region.trim_end_matches('省').trim_end_matches('市')
    } else {
        country
    };
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_forwarded_chain() {
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", "203.0.113.9, 10.0.0.1".parse().unwrap());
        assert_eq!(client_ip(&h).unwrap().to_string(), "203.0.113.9");
    }

    #[test]
    fn ignores_garbage() {
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", "unknown".parse().unwrap());
        assert!(client_ip(&h).is_none());
    }

    #[test]
    fn private_ranges_are_local() {
        assert!(is_private(&"127.0.0.1".parse().unwrap()));
        assert!(is_private(&"192.168.1.4".parse().unwrap()));
        assert!(!is_private(&"114.114.114.114".parse().unwrap()));
    }
}
