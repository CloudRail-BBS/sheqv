//! 联机大厅：用户自由上传的「我的世界服务器」与「铁锈战争中转站」。
//!
//! 两条硬规则：
//! 1. **探测永远不在请求里做**。大厅只读行上的快照，TCP/UDP 由后台循环按
//!    `probed_at` 轮转刷新，所以站点再卡也不会被一个连不上的 MC 服务器拖死。
//! 2. **地址只允许公网**（见 `netcheck`）。上传是自由填写的，不拦内网就成了内网扫描器。
//!
//! 铁锈战争条目本身没有「房间」概念——房间实时长在中转站上，这里只探测中转站是否可达、
//! 顺带记下房间数与总人数；具体房间由 `relay` 模块现取现用。

use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use tokio::task::JoinSet;

use crate::state::AppState;
use crate::{mcping, netcheck, relay};

pub const KINDS: [&str; 2] = ["minecraft", "rusted_warfare"];
pub const NAME_MIN: usize = 2;
pub const NAME_MAX: usize = 24;
pub const DESC_MAX: usize = 200;
pub const TAGS_MAX: usize = 3;
pub const TAG_LEN_MAX: usize = 12;

/// 同一轮最多探测多少个目标：一轮没探完的下一轮继续（按最久没探的优先）
const ROUND_LIMIT: i64 = 60;
/// 并发上限：太多会把出口带宽和 DNS 打满
const CONCURRENCY: usize = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerView {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub edition: String,
    pub description: String,
    pub tags: Vec<String>,
    /// 上传者昵称；用户被删后为空
    pub owner: String,
    pub owner_id: Option<String>,
    pub visibility: String,
    pub probe_state: String,
    pub probe_error: String,
    pub players_online: i64,
    pub players_max: i64,
    pub version_name: String,
    pub motd: String,
    pub latency_ms: i64,
    pub probed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    kind: String,
    name: String,
    host: String,
    port: i32,
    edition: String,
    description: String,
    tags: Value,
    owner: Option<String>,
    owner_id: Option<String>,
    visibility: String,
    probe_state: String,
    probe_error: String,
    players_online: i32,
    players_max: i32,
    version_name: String,
    motd: String,
    latency_ms: i32,
    probed_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT s.id, s.kind, s.name, s.host, s.port, s.edition, s.description,
        s.tags, u.nickname AS owner, s.owner_id, s.visibility,
        s.probe_state, s.probe_error, s.players_online, s.players_max,
        s.version_name, s.motd, s.latency_ms, s.probed_at, s.created_at
   FROM game_servers s LEFT JOIN users u ON u.id = s.owner_id";

impl Row {
    fn view(self) -> ServerView {
        ServerView {
            id: self.id,
            kind: self.kind,
            name: self.name,
            host: self.host,
            port: self.port,
            edition: self.edition,
            description: self.description,
            tags: self
                .tags
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            owner: self.owner.unwrap_or_default(),
            owner_id: self.owner_id,
            visibility: self.visibility,
            probe_state: self.probe_state,
            probe_error: self.probe_error,
            players_online: self.players_online as i64,
            players_max: self.players_max as i64,
            version_name: self.version_name,
            motd: self.motd,
            latency_ms: self.latency_ms as i64,
            probed_at: self.probed_at.map(|t| t.timestamp_millis()),
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

/* ── 校验 ───────────────────────────────── */

#[derive(Debug, Default)]
pub struct NewServer {
    pub kind: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub edition: String,
    pub description: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Default)]
pub struct PatchServer {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub edition: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub visibility: Option<String>,
}

pub enum ServerError {
    NotFound,
    Duplicate,
    Invalid(String),
    Db(sqlx::Error),
}

/// 校验并归一化。返回的是**可以直接落库**的值。
pub fn validate(input: &mut NewServer) -> Result<(), String> {
    input.kind = input.kind.trim().to_lowercase();
    input.name = input.name.trim().to_string();
    input.host = input.host.trim().to_lowercase();
    input.description = input.description.trim().to_string();
    input.edition = input.edition.trim().to_lowercase();

    if !KINDS.contains(&input.kind.as_str()) {
        return Err("类型只能是 minecraft 或 rusted_warfare".into());
    }
    let name_len = input.name.chars().count();
    if !(NAME_MIN..=NAME_MAX).contains(&name_len) {
        return Err(format!("名称需 {NAME_MIN}–{NAME_MAX} 字"));
    }
    if input.description.chars().count() > DESC_MAX {
        return Err(format!("简介不超过 {DESC_MAX} 字"));
    }
    input.tags = input
        .tags
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .take(TAGS_MAX)
        .collect();
    for t in &input.tags {
        if t.chars().count() > TAG_LEN_MAX {
            return Err(format!("单个标签不超过 {TAG_LEN_MAX} 字"));
        }
    }

    if input.kind == "minecraft" {
        if input.edition.is_empty() {
            input.edition = "java".into();
        }
        if input.edition != "java" && input.edition != "bedrock" {
            return Err("版本只能是 java 或 bedrock".into());
        }
        if input.port == 0 {
            input.port = if input.edition == "bedrock" { 19132 } else { 25565 };
        }
        if !(1..=65535).contains(&input.port) {
            return Err("端口需在 1–65535 之间".into());
        }
        if !is_host_like(&input.host) {
            return Err("请填写域名或 IP，不要带 http:// 或路径".into());
        }
    } else {
        // 铁锈战争填的是中转站根地址
        input.edition = String::new();
        input.port = 0;
        match relay::normalize_base(&input.host) {
            Ok(base) => input.host = base.to_lowercase(),
            Err(msg) => return Err(msg.to_string()),
        }
    }
    Ok(())
}

/// 域名 / IPv4 / IPv6 字面量。允许下划线是历史习惯（不少面板会生成带 `_` 的主机名）。
fn is_host_like(host: &str) -> bool {
    if host.is_empty() || host.len() > 190 {
        return false;
    }
    if let Some(inner) = host.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
        return inner.parse::<std::net::Ipv6Addr>().is_ok();
    }
    if host.parse::<std::net::Ipv4Addr>().is_ok() {
        return true;
    }
    // 剩下的必须是带点的域名；`localhost` 这种单标签名字直接拒绝
    host.contains('.')
        && !host.starts_with('.')
        && !host.ends_with('.')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/* ── 读写 ───────────────────────────────── */

pub async fn create(
    pool: &PgPool,
    owner_id: &str,
    input: &NewServer,
) -> Result<ServerView, ServerError> {
    let id = crate::ids::next('s');
    let tags = serde_json::json!(input.tags);
    let row: Row = sqlx::query_as(&format!(
        "WITH ins AS (
             INSERT INTO game_servers (id, kind, name, host, port, edition, description, tags, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *
         )
         {SELECT_WITH}"
    ))
    .bind(&id)
    .bind(&input.kind)
    .bind(&input.name)
    .bind(&input.host)
    .bind(input.port)
    .bind(&input.edition)
    .bind(&input.description)
    .bind(&tags)
    .bind(owner_id)
    .fetch_one(pool)
    .await
    .map_err(map_db_err)?;

    Ok(row.view())
}

/// `create` / `update` 复用同一段查询：把刚写的行按 `SELECT` 的形状取回来
const SELECT_WITH: &str = "SELECT ins.id, ins.kind, ins.name, ins.host, ins.port, ins.edition,
        ins.description, ins.tags, u.nickname AS owner, ins.owner_id, ins.visibility,
        ins.probe_state, ins.probe_error, ins.players_online, ins.players_max,
        ins.version_name, ins.motd, ins.latency_ms, ins.probed_at, ins.created_at
   FROM ins LEFT JOIN users u ON u.id = ins.owner_id";

pub async fn list(
    pool: &PgPool,
    kind: Option<&str>,
    include_hidden: bool,
) -> Result<Vec<ServerView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SELECT}
          WHERE ($1::text IS NULL OR s.kind = $1)
            AND ($2 OR s.visibility = 'public')
          ORDER BY (s.probe_state = 'online') DESC, s.players_online DESC, s.created_at DESC"
    ))
    .bind(kind)
    .bind(include_hidden)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::view).collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<ServerView>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("{SELECT} WHERE s.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::view))
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: &PatchServer,
) -> Result<Option<ServerView>, ServerError> {
    // 改了地址就把探测快照清空，否则会拿旧服务器的人数骗人
    let reset = patch.host.is_some() || patch.port.is_some() || patch.edition.is_some();

    // CTE 统一叫 ins：与 create 共用 SELECT_WITH（它按这个名字取行）
    let row: Option<Row> = sqlx::query_as(&format!(
        "WITH ins AS (
             UPDATE game_servers SET
                name        = COALESCE($2, name),
                host        = COALESCE($3, host),
                port        = COALESCE($4, port),
                edition     = COALESCE($5, edition),
                description = COALESCE($6, description),
                tags        = COALESCE($7, tags),
                visibility  = COALESCE($8, visibility),
                probe_state = CASE WHEN $9 THEN 'unknown' ELSE probe_state END,
                probe_error = CASE WHEN $9 THEN '' ELSE probe_error END,
                players_online = CASE WHEN $9 THEN 0 ELSE players_online END,
                players_max    = CASE WHEN $9 THEN 0 ELSE players_max END,
                probed_at   = CASE WHEN $9 THEN NULL ELSE probed_at END
              WHERE id = $1
              RETURNING *
         )
         {SELECT_WITH}"
    ))
    .bind(id)
    .bind(&patch.name)
    .bind(&patch.host)
    .bind(patch.port)
    .bind(&patch.edition)
    .bind(&patch.description)
    .bind(patch.tags.as_ref().map(|t| serde_json::json!(t)))
    .bind(&patch.visibility)
    .bind(reset)
    .fetch_optional(pool)
    .await
    .map_err(map_db_err)?;

    Ok(row.map(Row::view))
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let affected = sqlx::query("DELETE FROM game_servers WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(affected > 0)
}

fn map_db_err(e: sqlx::Error) -> ServerError {
    if let Some(db) = e.as_database_error() {
        if db.code().as_deref() == Some("23505") {
            return ServerError::Duplicate;
        }
    }
    ServerError::Db(e)
}

/* ── 探测 ───────────────────────────────── */

#[derive(sqlx::FromRow)]
pub struct Target {
    pub id: String,
    pub kind: String,
    pub host: String,
    pub port: i32,
    pub edition: String,
}

/// 挑出该刷新的一批目标：最久没探测的优先，只取公开条目。
pub async fn due_targets(pool: &PgPool, interval_secs: u64) -> Result<Vec<Target>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, kind, host, port, edition
           FROM game_servers
          WHERE visibility = 'public'
            AND (probed_at IS NULL OR probed_at < now() - ($1 || ' seconds')::interval)
          ORDER BY probed_at NULLS FIRST
          LIMIT $2",
    )
    .bind(interval_secs.to_string())
    .bind(ROUND_LIMIT)
    .fetch_all(pool)
    .await
}

/// 探测单个目标并落库。返回是否在线，仅用于日志。
pub async fn probe_and_store(st: &AppState, target: &Target) -> bool {
    let outcome = if target.kind == "minecraft" {
        mcping::probe(&target.host, target.port as u16, &target.edition).await
    } else {
        probe_relay(st, &target.host).await
    };

    let result = match outcome {
        Ok(status) => sqlx::query(
            "UPDATE game_servers SET
                probe_state = 'online', probe_error = '',
                players_online = $2, players_max = $3,
                version_name = $4, motd = $5, latency_ms = $6, probed_at = now()
              WHERE id = $1",
        )
        .bind(&target.id)
        .bind(status.players_online as i32)
        .bind(status.players_max as i32)
        .bind(&status.version)
        .bind(&status.motd)
        .bind(status.latency_ms as i32)
        .execute(&st.pool)
        .await
        .map(|_| true),
        Err(err) => sqlx::query(
            "UPDATE game_servers SET
                probe_state = 'offline', probe_error = $2,
                players_online = 0, players_max = 0,
                version_name = '', motd = '', latency_ms = 0, probed_at = now()
              WHERE id = $1",
        )
        .bind(&target.id)
        .bind(truncate(&err, 160))
        .execute(&st.pool)
        .await
        .map(|_| false),
    };

    match result {
        Ok(online) => online,
        Err(e) => {
            tracing::warn!(server = %target.id, error = %e, "写入探测结果失败");
            false
        }
    }
}

/// 铁锈战争：探测中转站可达性，并把房间数与总人数记在快照上。
async fn probe_relay(st: &AppState, base: &str) -> Result<mcping::Status, String> {
    let node = st.relay.snapshot(&st.http, base, relay::CACHE_TTL).await;
    if !node.ok {
        return Err(if node.error.is_empty() {
            "中转站不可达".to_string()
        } else {
            node.error
        });
    }

    let players: i64 = node.rooms.iter().map(|r| r.players).sum();

    Ok(mcping::Status {
        players_online: players,
        players_max: 0,
        version: format!("{} 个房间", node.rooms.len()),
        motd: if node.name.is_empty() {
            "铁锈战争中转站".to_string()
        } else {
            node.name
        },
        // 中转站的响应耗时由缓存层吞掉了，这里不编造数字
        latency_ms: 0,
    })
}

/// 后台探测循环：启动即探一轮，之后每隔 `SERVER_PROBE_SECS` 秒补一轮。
pub async fn probe_loop(st: AppState) {
    let interval_secs = st.cfg.probe_interval_secs.max(15);
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;
        match due_targets(&st.pool, interval_secs).await {
            Ok(targets) if targets.is_empty() => {}
            Ok(targets) => {
                tracing::info!(count = targets.len(), "开始刷新联机大厅状态");
                let started = std::time::Instant::now();
                let mut set = JoinSet::new();
                for target in targets {
                    while set.len() >= CONCURRENCY {
                        let _ = set.join_next().await;
                    }
                    let st = st.clone();
                    set.spawn(async move { probe_and_store(&st, &target).await });
                }
                while set.join_next().await.is_some() {}
                tracing::info!(ms = started.elapsed().as_millis() as u64, "本轮刷新完成");
            }
            Err(e) => tracing::warn!(error = %e, "读取待探测列表失败"),
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// 上传前先做一次可达性预检：填错端口的人马上能看到原因，而不是等后台刷新。
pub async fn precheck(input: &NewServer) -> Result<(), String> {
    match input.kind.as_str() {
        "minecraft" => netcheck::resolve_public(&input.host, input.port as u16)
            .await
            .map(|_| ())
            .map_err(str::to_string),
        _ => relay::normalize_base(&input.host)
            .map(|_| ())
            .map_err(str::to_string),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(kind: &str) -> NewServer {
        NewServer {
            kind: kind.into(),
            name: "测试服".into(),
            host: "play.example.com".into(),
            port: 0,
            edition: String::new(),
            description: "简介".into(),
            tags: vec!["生存".into(), "  ".into()],
        }
    }

    #[test]
    fn fills_default_ports() {
        let mut mc = base("minecraft");
        validate(&mut mc).unwrap();
        assert_eq!(mc.edition, "java");
        assert_eq!(mc.port, 25565);
        assert_eq!(mc.tags, vec!["生存".to_string()]);

        let mut be = base("minecraft");
        be.edition = "bedrock".into();
        validate(&mut be).unwrap();
        assert_eq!(be.port, 19132);
    }

    #[test]
    fn normalizes_relay_entries() {
        let mut rw = base("rusted_warfare");
        rw.host = "http://101.43.41.22:46784/relay/rooms".into();
        validate(&mut rw).unwrap();
        assert_eq!(rw.host, "http://101.43.41.22:46784");
        assert_eq!(rw.port, 0);
        assert_eq!(rw.edition, "");
    }

    #[test]
    fn rejects_bad_input() {
        let mut bad = base("minecraft");
        bad.name = "x".into();
        assert!(validate(&mut bad).is_err());

        let mut bad = base("minecraft");
        bad.host = "http://play.example.com".into();
        assert!(validate(&mut bad).is_err());

        let mut bad = base("minecraft");
        bad.port = 70000;
        assert!(validate(&mut bad).is_err());

        let mut bad = base("rusted_warfare");
        bad.host = "101.43.41.22:46784".into();
        assert!(validate(&mut bad).is_err());

        let mut bad = base("minecraft");
        bad.kind = "terraria".into();
        assert!(validate(&mut bad).is_err());
    }

    #[test]
    fn caps_tags() {
        let mut mc = base("minecraft");
        mc.tags = (0..6).map(|i| format!("t{i}")).collect();
        validate(&mut mc).unwrap();
        assert_eq!(mc.tags.len(), TAGS_MAX);
    }
}
