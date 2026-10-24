//! Minecraft 服务器探测（MOTD / 在线人数 / 版本 / 延迟）。
//!
//! 两种版本走两套完全不同的协议，所以分开写：
//! * **Java**：TCP 上的 Server List Ping。握手（protocol=-1 表示"未知版本"）→
//!   发 `0x00` 请求 → 收一个 VarInt 长度 + `0x00` + JSON 字符串。
//! * **基岩版**：UDP 上的 RakNet `Unconnected Ping`（`0x01`），
//!   回包 `0x1c` 里是 `MCPE;MOTD;协议;版本;在线;上限;...` 这样的分号串。
//!
//! 这里**不引入第三方 ping 库**：两个协议都只有几十行，自己写能把
//! 「超时 / 内网地址 / 畸形响应」的处理握在手里，也少一层依赖。

use std::net::SocketAddr;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, UdpSocket};
use tokio::time::timeout;

use crate::netcheck;

/// 单次探测的总预算（含 DNS）。后台每轮都有若干目标，不能让它拖住整个循环。
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// RakNet 的魔术常量，握手包与回包里都必须逐字节一致
const RAKNET_MAGIC: [u8; 16] = [
    0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78,
];

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub players_online: i64,
    pub players_max: i64,
    pub version: String,
    pub motd: String,
    pub latency_ms: i64,
}

/// 按版本分派探测。`edition` 只认 `java` / `bedrock`，其它按 java 处理。
pub async fn probe(host: &str, port: u16, edition: &str) -> Result<Status, String> {
    let result = if edition == "bedrock" {
        timeout(PROBE_TIMEOUT, probe_bedrock(host, port)).await
    } else {
        timeout(PROBE_TIMEOUT, probe_java(host, port)).await
    };
    match result {
        Ok(r) => r,
        Err(_) => Err("探测超时".to_string()),
    }
}

/* ── Java ───────────────────────────────── */

async fn probe_java(host: &str, port: u16) -> Result<Status, String> {
    let addrs = netcheck::resolve_public(host, port)
        .await
        .map_err(str::to_string)?;

    let started = Instant::now();
    let mut stream = connect_any(&addrs).await?;
    let mut status = java_status(&mut stream, host, port).await?;
    status.latency_ms = started.elapsed().as_millis() as i64;
    Ok(status)
}

/// 真正走一遍 SLP 握手。独立成函数是为了能用本地假服务器测——
/// `resolve_public` 会挡住 127.0.0.1，端到端测试到不了这一步。
async fn java_status<S>(stream: &mut S, host: &str, port: u16) -> Result<Status, String>
where
    S: AsyncReadExt + AsyncWriteExt + Unpin,
{
    // 握手：packetId=0x00, protocol=-1, host, port, nextState=1
    let mut body = Vec::new();
    write_varint(&mut body, 0);
    write_varint(&mut body, -1);
    write_string(&mut body, host);
    body.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut body, 1);
    write_frame(stream, &body).await?;

    // 状态请求：只有一个 0x00 的空包
    write_frame(stream, &[0x00]).await?;

    let len = read_varint(stream).await?;
    // 正常响应几百字节；挡住服务端乱回报一个巨大长度把内存撑爆
    if !(1..=2 * 1024 * 1024).contains(&len) {
        return Err("响应长度异常".to_string());
    }
    let mut buf = vec![0u8; len as usize];
    stream.read_exact(&mut buf).await.map_err(read_err)?;

    let mut cur = &buf[..];
    let _packet_id = read_varint_slice(&mut cur)?;
    let json_len = read_varint_slice(&mut cur)?;
    if json_len < 0 || json_len as usize > cur.len() {
        return Err("响应结构异常".to_string());
    }
    let json = &cur[..json_len as usize];

    let parsed = parse_java_status(json)?;
    Ok(Status {
        players_online: parsed.players_online,
        players_max: parsed.players_max,
        version: parsed.version,
        motd: parsed.motd,
        latency_ms: 0,
    })
}

async fn connect_any(addrs: &[SocketAddr]) -> Result<TcpStream, String> {
    let mut last = String::from("连接失败");
    // 域名常常同时有 A / AAAA，前一个不通就试下一个（IPv6 在不少机器上没路由）
    for addr in addrs.iter().take(4) {
        match timeout(Duration::from_secs(3), TcpStream::connect(addr)).await {
            Ok(Ok(s)) => {
                let _ = s.set_nodelay(true);
                return Ok(s);
            }
            Ok(Err(e)) => last = format!("连接失败：{}", e.kind()),
            Err(_) => last = "连接超时".to_string(),
        }
    }
    Err(last)
}

fn write_varint(out: &mut Vec<u8>, value: i32) {
    let mut v = value as u32;
    loop {
        if v & !0x7f == 0 {
            out.push(v as u8);
            return;
        }
        out.push(((v & 0x7f) as u8) | 0x80);
        v >>= 7;
    }
}

fn write_string(out: &mut Vec<u8>, s: &str) {
    write_varint(out, s.len() as i32);
    out.extend_from_slice(s.as_bytes());
}

async fn write_frame<W: AsyncWriteExt + Unpin>(w: &mut W, body: &[u8]) -> Result<(), String> {
    let mut buf = Vec::with_capacity(body.len() + 5);
    write_varint(&mut buf, body.len() as i32);
    buf.extend_from_slice(body);
    w.write_all(&buf).await.map_err(write_err)
}

async fn read_varint<R: AsyncReadExt + Unpin>(r: &mut R) -> Result<i32, String> {
    let mut value: i32 = 0;
    for i in 0..5 {
        let b = r.read_u8().await.map_err(read_err)?;
        value |= ((b & 0x7f) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err("varint 过长".to_string())
}

fn read_varint_slice(buf: &mut &[u8]) -> Result<i32, String> {
    let mut value: i32 = 0;
    for i in 0..5 {
        let b = *buf.first().ok_or("响应过早结束")?;
        *buf = &buf[1..];
        value |= ((b & 0x7f) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err("varint 过长".to_string())
}

/// 只做解析，方便单测：输入是 `description` 之后那段 JSON 字节
struct JavaPayload {
    players_online: i64,
    players_max: i64,
    version: String,
    motd: String,
}

fn parse_java_status(json: &[u8]) -> Result<JavaPayload, String> {
    let v: Value = serde_json::from_slice(json).map_err(|_| "响应不是合法 JSON".to_string())?;
    let motd = v
        .get("description")
        .map(flatten_chat)
        .map(|s| strip_codes(&s))
        .unwrap_or_default();

    Ok(JavaPayload {
        players_online: v
            .pointer("/players/online")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        players_max: v
            .pointer("/players/max")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        version: v
            .pointer("/version/name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        motd: motd.chars().take(120).collect(),
    })
}

/// `description` 可能是字符串，也可能是聊天组件（`{text, extra[]}`），递归摊平
fn flatten_chat(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Array(items) => items.iter().map(flatten_chat).collect::<Vec<_>>().concat(),
        Value::Object(obj) => {
            let mut out = obj
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Some(extra) = obj.get("extra").and_then(Value::as_array) {
                for item in extra {
                    out.push_str(&flatten_chat(item));
                }
            }
            if out.is_empty() {
                if let Some(tr) = obj.get("translate").and_then(Value::as_str) {
                    out.push_str(tr);
                }
            }
            out
        }
        _ => String::new(),
    }
}

/// MC 的 MOTD 里塞满 `§a` 这类颜色码，直接展示会变成乱码方块
fn strip_codes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else if c == '\n' || c == '\r' {
            out.push(' ');
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

/* ── 基岩版 ─────────────────────────────── */

async fn probe_bedrock(host: &str, port: u16) -> Result<Status, String> {
    let addrs = netcheck::resolve_public(host, port)
        .await
        .map_err(str::to_string)?;
    let target = *addrs.first().ok_or("域名解析失败")?;

    // UDP 的 bind 地址必须与目标同族，否则 send 会直接失败
    let bind = if target.is_ipv6() { "[::]:0" } else { "0.0.0.0:0" };
    let sock = UdpSocket::bind(bind)
        .await
        .map_err(|e| format!("创建 UDP 失败：{}", e.kind()))?;
    sock.connect(target)
        .await
        .map_err(|e| format!("连接失败：{}", e.kind()))?;

    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut pkt = Vec::with_capacity(33);
    pkt.push(0x01); // Unconnected Ping
    pkt.extend_from_slice(&now_ms.to_be_bytes());
    pkt.extend_from_slice(&RAKNET_MAGIC);
    pkt.extend_from_slice(&rand::random::<i64>().to_be_bytes());

    let started = Instant::now();
    sock.send(&pkt)
        .await
        .map_err(|e| format!("发送失败：{}", e.kind()))?;

    let mut buf = [0u8; 2048];
    let n = timeout(Duration::from_secs(4), sock.recv(&mut buf))
        .await
        .map_err(|_| "无响应".to_string())?
        .map_err(|e| format!("接收失败：{}", e.kind()))?;
    let latency_ms = started.elapsed().as_millis() as i64;

    let resp = &buf[..n];
    if resp.first() != Some(&0x1c) {
        return Err("响应格式不对".to_string());
    }
    // 1 字节 id + 8 时间 + 8 serverGuid + 16 magic + 2 长度
    if resp.len() < 35 {
        return Err("响应过短".to_string());
    }
    let len = u16::from_be_bytes([resp[33], resp[34]]) as usize;
    let end = 35 + len;
    if end > resp.len() {
        return Err("响应长度越界".to_string());
    }
    let payload = std::str::from_utf8(&resp[35..end]).map_err(|_| "响应不是 UTF-8".to_string())?;

    let parsed = parse_bedrock_payload(payload)?;
    Ok(Status {
        players_online: parsed.players_online,
        players_max: parsed.players_max,
        version: parsed.version,
        motd: parsed.motd,
        latency_ms,
    })
}

struct BedrockPayload {
    players_online: i64,
    players_max: i64,
    version: String,
    motd: String,
}

/// `MCPE;MOTD;协议号;版本;在线;上限;serverId;副标题;模式;模式号;端口v4;端口v6`
fn parse_bedrock_payload(payload: &str) -> Result<BedrockPayload, String> {
    let parts: Vec<&str> = payload.split(';').collect();
    if parts.len() < 6 {
        return Err("响应字段不足".to_string());
    }
    if parts[0] != "MCPE" && parts[0] != "MCEE" {
        return Err("不是基岩版响应".to_string());
    }

    let num = |s: &str| s.trim().parse::<i64>().unwrap_or(0);
    let mut motd = strip_codes(parts[1]);
    // 有副标题时接在后面，和游戏里看到的两行一致
    if let Some(sub) = parts.get(7).map(|s| strip_codes(s)) {
        if !sub.is_empty() {
            motd.push_str(" · ");
            motd.push_str(&sub);
        }
    }

    Ok(BedrockPayload {
        players_online: num(parts[4]),
        players_max: num(parts[5]),
        version: parts[3].trim().to_string(),
        motd: motd.chars().take(120).collect(),
    })
}

/* ── 错误文案 ───────────────────────────── */

fn read_err(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::UnexpectedEof {
        "连接被对方关闭".to_string()
    } else {
        format!("读取失败：{}", e.kind())
    }
}

fn write_err(e: std::io::Error) -> String {
    format!("发送失败：{}", e.kind())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varint_roundtrip() {
        for v in [0, 1, 127, 128, 255, 300, 65535, 2_000_000, -1] {
            let mut buf = Vec::new();
            write_varint(&mut buf, v);
            let mut cur = &buf[..];
            assert_eq!(read_varint_slice(&mut cur).unwrap(), v, "值 {v}");
            assert!(cur.is_empty());
        }
    }

    #[test]
    fn parses_java_json() {
        let json = br#"{"version":{"name":"1.20.4","protocol":765},
            "players":{"max":100,"online":37},
            "description":{"text":"Hello ","extra":[{"text":"World","color":"gold"}]}}"#;
        let p = parse_java_status(json).unwrap();
        assert_eq!(p.version, "1.20.4");
        assert_eq!(p.players_online, 37);
        assert_eq!(p.players_max, 100);
        assert_eq!(p.motd, "Hello World");
    }

    #[test]
    fn strips_color_codes_and_newlines() {
        assert_eq!(strip_codes("§aHello §lWorld§r\nsecond"), "Hello World second");
        assert_eq!(strip_codes("plain"), "plain");
    }

    #[test]
    fn parses_bedrock_payload() {
        let p =
            parse_bedrock_payload("MCPE;Dedicated Server;671;1.20.50;3;10;12345;Bedrock level;Survival;1;19132;19133")
                .unwrap();
        assert_eq!(p.players_online, 3);
        assert_eq!(p.players_max, 10);
        assert_eq!(p.version, "1.20.50");
        assert_eq!(p.motd, "Dedicated Server · Bedrock level");
    }

    #[test]
    fn rejects_non_bedrock_payload() {
        assert!(parse_bedrock_payload("HTTP/1.1 400").is_err());
        assert!(parse_bedrock_payload("MCPE;too;few").is_err());
    }

    /// 用一个假 MC 服务器跑完整的 SLP 往返：握手 → 状态请求 → JSON 响应。
    /// 这条用例比任何"看起来对"的注释都可靠——线格式一错它立刻挂。
    #[tokio::test]
    async fn speaks_java_slp_against_mock_server() {
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            // 握手包：长度前缀 + packetId(0)
            let len = read_varint(&mut sock).await.unwrap();
            let mut body = vec![0u8; len as usize];
            sock.read_exact(&mut body).await.unwrap();
            assert_eq!(body[0], 0x00);
            // 状态请求包
            let len = read_varint(&mut sock).await.unwrap();
            let mut req = vec![0u8; len as usize];
            sock.read_exact(&mut req).await.unwrap();
            assert_eq!(req, vec![0x00]);

            // 回一个标准状态响应
            let json = br#"{"version":{"name":"1.21.4"},"players":{"online":7,"max":30},"description":{"text":"Mock ","extra":[{"text":"Server"}]}}"#;
            let mut payload = vec![0x00];
            write_varint(&mut payload, json.len() as i32);
            payload.extend_from_slice(json);
            write_frame(&mut sock, &payload).await.unwrap();
        });

        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        let status = java_status(&mut stream, "mock.example.com", 25565)
            .await
            .unwrap();
        assert_eq!(status.players_online, 7);
        assert_eq!(status.players_max, 30);
        assert_eq!(status.version, "1.21.4");
        assert_eq!(status.motd, "Mock Server");
    }

    #[tokio::test]
    async fn refuses_internal_targets() {
        let err = probe("127.0.0.1", 25565, "java").await.unwrap_err();
        assert!(err.contains("公网"), "实际：{err}");
        let err = probe("localhost", 19132, "bedrock").await.unwrap_err();
        assert!(err.contains("公网"), "实际：{err}");
    }
}
