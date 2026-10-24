//! 铁锈战争（Rusted Warfare）联机房的实时数据。
//!
//! 房间由中转站（RW-HPS / CNKDRelay）维护，站点这边**不存房间**，只做两件事：
//! 1. 拉 `{中转站}/relay/rooms`，把 `data.rooms` 摊平成大厅能直接渲染的形状；
//! 2. 在进程内缓存 10 秒——大厅每 15 秒轮询一次，多个访客不该打出一堆重复请求。
//!
//! 中转站挂了不能让大厅变白板：上一次成功的结果会留着，标记成 `ok=false` 继续展示，
//! 前端据此显示「数据可能已过期」。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tokio::sync::Mutex;

use crate::netcheck;

/// 缓存有效期。比前端的轮询间隔短一档，保证前端每次轮询都能拿到新数据。
pub const CACHE_TTL: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub id: String,
    pub display_id: String,
    /// 当前人数（中转站的 `playerSize`）
    pub players: i64,
    /// 活跃连接数，比人数略少（含观战/断线重连）
    pub connections: i64,
    /// ingame / waiting / closed……
    pub status: String,
    pub host: String,
    pub map: String,
    pub is_mod: bool,
    pub public_room: bool,
    pub join_link: String,
    pub created_at: i64,
    pub last_active_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    /// 中转站根地址（已归一化，不含 `/relay/rooms`）
    pub url: String,
    pub name: String,
    pub role: String,
    pub room_count: i64,
    pub updated_at: i64,
    /// 这份数据是什么时候取到的（毫秒）
    pub fetched_at: i64,
    /// 本次是否刷新成功
    pub ok: bool,
    pub error: String,
    pub rooms: Vec<Room>,
}

#[derive(Clone)]
struct Entry {
    at: Instant,
    node: Node,
}

/// 按中转站地址缓存最近一次成功结果
#[derive(Clone, Default)]
pub struct Cache {
    inner: Arc<Mutex<HashMap<String, Entry>>>,
}

impl Cache {
    /// 取快照：命中缓存直接返回；过期则重新拉，失败时回落到旧数据。
    pub async fn snapshot(&self, client: &reqwest::Client, url: &str, ttl: Duration) -> Node {
        if let Some(hit) = self.inner.lock().await.get(url) {
            if hit.at.elapsed() < ttl {
                return hit.node.clone();
            }
        }

        match self.fetch(client, url).await {
            Ok(node) => {
                self.inner.lock().await.insert(
                    url.to_string(),
                    Entry {
                        at: Instant::now(),
                        node: node.clone(),
                    },
                );
                node
            }
            Err(err) => {
                let stale = self.inner.lock().await.get(url).cloned();
                match stale {
                    Some(Entry { node, .. }) => Node {
                        ok: false,
                        error: err,
                        ..node
                    },
                    None => Node {
                        url: url.to_string(),
                        name: String::new(),
                        role: String::new(),
                        room_count: 0,
                        updated_at: 0,
                        fetched_at: now_ms(),
                        ok: false,
                        error: err,
                        rooms: Vec::new(),
                    },
                }
            }
        }
    }

    async fn fetch(&self, client: &reqwest::Client, base: &str) -> Result<Node, String> {
        let endpoint = format!("{base}/relay/rooms");
        let host = reqwest::Url::parse(&endpoint)
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
            .ok_or_else(|| "中转站地址不合法".to_string())?;
        let port = reqwest::Url::parse(&endpoint)
            .ok()
            .and_then(|u| u.port_or_known_default())
            .unwrap_or(80);
        netcheck::resolve_public(&host, port)
            .await
            .map_err(str::to_string)?;

        let resp = client
            .get(&endpoint)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "连接超时".to_string()
                } else {
                    format!("连接失败：{e}")
                }
            })?;
        if !resp.status().is_success() {
            return Err(format!("中转站返回 {}", resp.status().as_u16()));
        }
        let body: Value = resp
            .json()
            .await
            .map_err(|_| "中转站响应不是 JSON".to_string())?;

        Ok(parse_node(base, &body))
    }
}

/// 把中转站的响应摊平。字段缺失一律按空值处理——中转站版本会变，
/// 少一个字段不该让整个大厅 500。
pub fn parse_node(base: &str, body: &Value) -> Node {
    let data = body.get("data").unwrap_or(body);
    let rooms: Vec<Room> = data
        .get("rooms")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().map(parse_room).collect())
        .unwrap_or_default();

    Node {
        url: base.to_string(),
        name: text(data, "nodeName"),
        role: text(data, "role"),
        room_count: data
            .get("roomCount")
            .and_then(Value::as_i64)
            .unwrap_or(rooms.len() as i64),
        updated_at: data
            .get("updateTimestamp")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        fetched_at: now_ms(),
        ok: body.get("ok").and_then(Value::as_bool).unwrap_or(true),
        error: if body.get("ok").and_then(Value::as_bool) == Some(false) {
            "中转站返回失败".to_string()
        } else {
            String::new()
        },
        rooms,
    }
}

fn parse_room(v: &Value) -> Room {
    Room {
        id: text(v, "roomId"),
        display_id: text(v, "displayId"),
        players: v.get("playerSize").and_then(Value::as_i64).unwrap_or(0),
        connections: v
            .get("activeConnectionSize")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        status: text(v, "status"),
        host: text(v, "hostName"),
        map: pretty_map(&text(v, "mapName")),
        is_mod: v.get("isMod").and_then(Value::as_bool).unwrap_or(false),
        public_room: v
            .get("publicRoom")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        join_link: join_link(&text(v, "joinLink")),
        created_at: v
            .get("roomCreateTime")
            .and_then(Value::as_i64)
            .map(|s| s * 1000)
            .unwrap_or(0),
        last_active_at: v
            .get("lastActivityTime")
            .and_then(Value::as_i64)
            .map(|s| s * 1000)
            .unwrap_or(0),
    }
}

fn text(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

/// 地图名在协议里有三种写法，统一成「人类能读的名字」：
/// * `maps2/欧洲14p.tmx`
/// * `NEW_PATH|maps2/欧洲14p.tmx`
/// * `MOD|<sha256>//maps/优化多矿版单面水晶.tmx`
pub fn pretty_map(raw: &str) -> String {
    let s = raw.trim();
    let s = s.strip_prefix("MOD|").unwrap_or(s);
    let s = s.split("//").last().unwrap_or(s);
    let s = s.split('|').next_back().unwrap_or(s);
    let s = s.rsplit('/').next().unwrap_or(s);
    let s = s.trim_end_matches(".tmx").trim();
    s.to_string()
}

/// `www.cnkd.fun/RKC562` 这种没写协议的补上 https，已经是 URL 的原样返回
pub fn join_link(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }
    if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    }
}

/// 用户填的地址可能是根地址，也可能直接把 `/relay/rooms` 粘过来
pub fn normalize_base(raw: &str) -> Result<String, &'static str> {
    let t = raw.trim().trim_end_matches('/');
    if t.is_empty() {
        return Err("中转站地址不能为空");
    }
    let t = t.strip_suffix("/relay/rooms").unwrap_or(t);
    let t = t.trim_end_matches('/');
    let url = reqwest::Url::parse(t).map_err(|_| "请填写完整地址，例如 http://1.2.3.4:46784")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("只支持 http / https 地址");
    }
    if url.host_str().is_none() {
        return Err("地址里缺少主机名");
    }
    Ok(t.to_string())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trims_map_name_variants() {
        assert_eq!(pretty_map("maps2/欧洲14p.tmx"), "欧洲14p");
        assert_eq!(pretty_map("NEW_PATH|maps2/跨江大桥重制版11P隔离区.tmx"), "跨江大桥重制版11P隔离区");
        assert_eq!(
            pretty_map("MOD|78E8278D//maps/优化多矿版单面水晶.tmx"),
            "优化多矿版单面水晶"
        );
        assert_eq!(pretty_map("台湾海峡.tmx"), "台湾海峡");
        assert_eq!(pretty_map(""), "");
    }

    #[test]
    fn normalizes_join_link() {
        assert_eq!(join_link("www.cnkd.fun/RKC562"), "https://www.cnkd.fun/RKC562");
        assert_eq!(join_link("http://a/b"), "http://a/b");
        assert_eq!(join_link(""), "");
    }

    #[test]
    fn normalizes_relay_base() {
        assert_eq!(
            normalize_base("http://101.43.41.22:46784/relay/rooms").unwrap(),
            "http://101.43.41.22:46784"
        );
        assert_eq!(
            normalize_base("http://101.43.41.22:46784/").unwrap(),
            "http://101.43.41.22:46784"
        );
        assert!(normalize_base("101.43.41.22:46784").is_err());
        assert!(normalize_base("ftp://x/y").is_err());
    }

    #[test]
    fn parses_real_payload_shape() {
        let body = json!({
            "ok": true,
            "data": {
                "nodeName": "CNKD 上海服务器",
                "role": "core",
                "roomCount": 1,
                "updateTimestamp": 1792823045078i64,
                "rooms": [{
                    "roomId": "562",
                    "displayId": "RKC562",
                    "playerSize": 4,
                    "activeConnectionSize": 3,
                    "status": "ingame",
                    "hostName": "雨落叹长安",
                    "mapName": "NEW_PATH|maps2/欧洲14p.tmx",
                    "isMod": true,
                    "publicRoom": false,
                    "joinLink": "www.cnkd.fun/RKC562",
                    "roomCreateTime": 1792822573,
                    "lastActivityTime": 1792823044
                }]
            }
        });
        let node = parse_node("http://x", &body);
        assert_eq!(node.name, "CNKD 上海服务器");
        assert_eq!(node.room_count, 1);
        assert!(node.ok);
        assert_eq!(node.rooms[0].players, 4);
        assert_eq!(node.rooms[0].map, "欧洲14p");
        assert_eq!(node.rooms[0].join_link, "https://www.cnkd.fun/RKC562");
        assert_eq!(node.rooms[0].created_at, 1792822573000);
    }

    #[test]
    fn tolerates_missing_fields() {
        let node = parse_node("http://x", &json!({ "data": {} }));
        assert!(node.rooms.is_empty());
        assert_eq!(node.room_count, 0);
    }
}
