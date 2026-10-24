//! 出站探测的地址白名单：**只允许公网目标**。
//!
//! 大厅的地址是用户自由填写的。如果照填就拨号，任何人都能借这台服务器去扫内网：
//! `127.0.0.1`、`10.0.0.0/8`、`169.254.169.254`（云元数据）、容器里的 `db:5432`……
//! 所以解析出来的 IP 必须全部是公网，才允许连。

use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicBool, Ordering};

/// 是否放行 `198.18.0.0/15`（fake-ip）。
///
/// 这类地址本身不可路由，放行它并不会带来 SSRF 风险；它是给「本机挂着 Clash 之类
/// fake-ip 代理」的部署用的——那种环境下**所有域名**都解析到 198.18.x.x，
/// 不放行的话探测全军覆没。由 `PROBE_ALLOW_FAKE_IP=1` 打开，默认关。
static ALLOW_FAKE_IP: AtomicBool = AtomicBool::new(false);

pub fn configure(allow_fake_ip: bool) {
    ALLOW_FAKE_IP.store(allow_fake_ip, Ordering::Relaxed);
}

/// 单个 IP 是否属于「可以对外探测」的范围。
///
/// 这里不追求完整实现 `is_global`（那需要 IANA 特殊用途地址表），
/// 而是把**能造成危害的几类**全挡掉：内网、回环、链路本地、组播、保留/文档段。
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.is_multicast()
                // 100.64.0.0/10 运营商级 NAT
                || (o[0] == 100 && (64..128).contains(&o[1]))
                // 0.0.0.0/8
                || o[0] == 0
                // 198.18.0.0/15 基准测试段；fake-ip 代理会往这里塞所有域名
                || (o[0] == 198
                    && (o[1] == 18 || o[1] == 19)
                    && !ALLOW_FAKE_IP.load(Ordering::Relaxed)))
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                // IPv4 映射地址（::ffff:10.0.0.1）要按 v4 规则再看一遍
                || v6.to_ipv4_mapped().is_some_and(|v4| !is_public_ip(IpAddr::V4(v4))))
        }
    }
}

/// 解析域名并做白名单校验。返回的地址可以直接拿去 connect。
pub async fn resolve_public(host: &str, port: u16) -> Result<Vec<SocketAddr>, &'static str> {
    let host = host.trim();
    if host.is_empty() {
        return Err("地址不能为空");
    }
    if port == 0 {
        return Err("端口不合法");
    }

    // 直接写 IP 时跳过 DNS，顺便挡住 127.0.0.1 这类
    let addrs: Vec<SocketAddr> = match host.parse::<IpAddr>() {
        Ok(ip) => vec![SocketAddr::new(ip, port)],
        Err(_) => tokio::net::lookup_host((host, port))
            .await
            .map_err(|_| "域名解析失败")?
            .collect(),
    };
    if addrs.is_empty() {
        return Err("域名解析失败");
    }
    if addrs.iter().any(|a| !is_public_ip(a.ip())) {
        return Err("只允许探测公网地址");
    }
    Ok(addrs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v4(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn blocks_internal_targets() {
        for s in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.9",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "198.18.0.1",
        ] {
            assert!(!is_public_ip(v4(s)), "{s} 应该被拦");
        }
        for s in ["::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1"] {
            assert!(!is_public_ip(s.parse().unwrap()), "{s} 应该被拦");
        }
    }

    #[test]
    fn allows_public_targets() {
        for s in ["1.1.1.1", "101.43.41.22", "8.8.8.8", "2606:4700:4700::1111"] {
            assert!(is_public_ip(s.parse().unwrap()), "{s} 应该放行");
        }
    }

    #[tokio::test]
    async fn resolves_and_checks() {
        assert!(resolve_public("127.0.0.1", 80).await.is_err());
        assert!(resolve_public("localhost", 80).await.is_err());
        // 公网字面量不依赖 DNS，离线也能过
        assert!(resolve_public("1.1.1.1", 443).await.is_ok());
    }
}
