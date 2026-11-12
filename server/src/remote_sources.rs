//! 外部资源站的“发现/拉取”。
//!
//! 资源库除了本站上传，还可以把 Modrinth / CurseForge 的条目**直接拉进来展示**：
//! 搜索走官方 API，结果标准化成 `RemoteItem`，用户点「导入」才落库（不落库就只做展示）。
//!
//! 三个站的现实情况不一样，别装作一样：
//! - **Modrinth**：公开 API，免 key，直接可用；
//! - **CurseForge**：API 需要 key（后台「站点设置 → CurseForge API Key」填），没有就明确报错；
//! - **rtsbox**：WordPress + 反爬，非浏览器请求只回一张占位页（`<h1>API 接口文档`），
//!   REST 也 403。所以它只能“粘链接手动建条目”，这里不提供在线拉取。

use serde::Serialize;
use serde_json::Value;

/// 支持在线拉取的站点
pub const ONLINE_SOURCES: [&str; 2] = ["modrinth", "curseforge"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteItem {
    pub source: String,
    /// 站点内的项目标识（Modrinth slug / CurseForge slug）
    pub source_id: String,
    pub title: String,
    pub summary: String,
    pub author: String,
    pub icon: String,
    pub downloads: i64,
    /// 项目页地址（原站）
    pub url: String,
    /// 本站的 `source_kind`：mods / modpacks / resourcepacks / shaderpacks / datapacks
    pub kind: String,
    /// 原站的更新时间（毫秒），拿不到就是 0
    pub updated: i64,
}

impl RemoteItem {
    /// 落库时用的规范化分类（CurseForge 的 classId 与 Modrinth 的 project_type 都归到这里）
    pub fn game(&self) -> &'static str {
        "minecraft"
    }
}

fn kind_zh(kind: &str) -> &'static str {
    match kind {
        "modpacks" => "整合包",
        "resourcepacks" => "材质",
        "shaderpacks" => "光影",
        "datapacks" => "其他",
        _ => "其他",
    }
}

/// 建议的分类名（对应后台可维护的资源分类 key；对不上就让调用方自己选）
pub fn suggest_category(kind: &str) -> &'static str {
    kind_zh(kind)
}

fn plural_type(t: &str) -> &'static str {
    match t {
        "mod" => "mods",
        "modpack" => "modpacks",
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        "datapack" => "datapacks",
        _ => "mods",
    }
}

fn singular_kind(kind: &str) -> &'static str {
    match kind {
        "modpacks" => "modpack",
        "resourcepacks" => "resourcepack",
        "shaderpacks" => "shader",
        "datapacks" => "datapack",
        _ => "mod",
    }
}

fn str_of(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// Modrinth 搜索。公开 API，但要带 UA，否则会被限流。
pub async fn search_modrinth(
    http: &reqwest::Client,
    q: &str,
    kind: Option<&str>,
    limit: i64,
) -> Result<Vec<RemoteItem>, String> {
    let url = format!(
        "https://api.modrinth.com/v2/search?query={}&limit={}&index=downloads",
        urlencode(q),
        limit.clamp(1, 30)
    );
    let resp = http
        .get(&url)
        .header("User-Agent", "CloudRail-Community/1.0 (resource library)")
        .send()
        .await
        .map_err(|e| format!("连不上 Modrinth：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth 返回 {}", resp.status()));
    }
    let data: Value = resp.json().await.map_err(|e| format!("Modrinth 响应解析失败：{e}"))?;
    let hits = data.get("hits").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    Ok(hits
        .iter()
        .filter_map(|h| {
            let ptype = str_of(h, "project_type");
            let item_kind = plural_type(&ptype).to_string();
            if let Some(want) = kind {
                if !want.is_empty() && item_kind != want {
                    return None;
                }
            }
            let slug = str_of(h, "slug");
            if slug.is_empty() {
                return None;
            }
            Some(RemoteItem {
                source: "modrinth".into(),
                source_id: slug.clone(),
                title: str_of(h, "title"),
                summary: str_of(h, "description"),
                author: str_of(h, "author"),
                icon: str_of(h, "icon_url"),
                downloads: h.get("downloads").and_then(|v| v.as_i64()).unwrap_or(0),
                url: format!("https://modrinth.com/{}/{slug}", singular_kind(&item_kind)),
                kind: item_kind,
                updated: parse_date(h.get("date_modified").and_then(|v| v.as_str())),
            })
        })
        .collect())
}

/// CurseForge 搜索。没有 key 时直接返回可读的错误，前端据此提示去后台配置。
pub async fn search_curseforge(
    http: &reqwest::Client,
    api_key: &str,
    q: &str,
    kind: Option<&str>,
    limit: i64,
) -> Result<Vec<RemoteItem>, String> {
    if api_key.trim().is_empty() {
        return Err("未配置 CurseForge API Key（站点设置 → 客户端 / 外链）".into());
    }
    let class_id = match kind.unwrap_or("mods") {
        "modpacks" => 4471,
        "resourcepacks" => 12,
        "shaderpacks" => 6552,
        "datapacks" => 6945,
        _ => 6,
    };
    let url = format!(
        "https://api.curseforge.com/v1/mods/search?gameId=432&classId={class_id}&searchFilter={}&pageSize={}&sortField=2&sortOrder=desc",
        urlencode(q),
        limit.clamp(1, 30)
    );
    let resp = http
        .get(&url)
        .header("x-api-key", api_key.trim())
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("连不上 CurseForge：{e}"))?;
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("CurseForge API Key 无效或没有权限".into());
    }
    if !resp.status().is_success() {
        return Err(format!("CurseForge 返回 {}", resp.status()));
    }
    let data: Value = resp.json().await.map_err(|e| format!("CurseForge 响应解析失败：{e}"))?;
    let rows = data.get("data").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    Ok(rows
        .iter()
        .filter_map(|m| {
            let slug = str_of(m, "slug");
            let website = m
                .get("links")
                .and_then(|l| l.get("websiteUrl"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if slug.is_empty() && website.is_empty() {
                return None;
            }
            let item_kind = match m.get("classId").and_then(|v| v.as_i64()).unwrap_or(6) {
                4471 => "modpacks",
                12 => "resourcepacks",
                6552 => "shaderpacks",
                6945 => "datapacks",
                _ => "mods",
            }
            .to_string();
            Some(RemoteItem {
                source: "curseforge".into(),
                source_id: if slug.is_empty() { website.clone() } else { slug },
                title: str_of(m, "name"),
                summary: str_of(m, "summary"),
                author: m
                    .get("authors")
                    .and_then(|a| a.as_array())
                    .and_then(|a| a.first())
                    .map(|a| str_of(a, "name"))
                    .unwrap_or_default(),
                icon: m
                    .get("logo")
                    .and_then(|l| l.get("thumbnailUrl").or_else(|| l.get("url")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                downloads: m.get("downloadCount").and_then(|v| v.as_i64()).unwrap_or(0),
                url: if website.is_empty() {
                    format!("https://www.curseforge.com/minecraft/mc-mods/{}", str_of(m, "slug"))
                } else {
                    website
                },
                kind: item_kind,
                updated: parse_date(m.get("dateModified").and_then(|v| v.as_str())),
            })
        })
        .collect())
}

/// ISO8601 → 毫秒；解析不出来就是 0（前端当“未知”处理）
fn parse_date(raw: Option<&str>) -> i64 {
    let Some(raw) = raw else { return 0 };
    chrono::DateTime::parse_from_rfc3339(raw)
        .map(|t| t.timestamp_millis())
        .unwrap_or(0)
}

fn urlencode(raw: &str) -> String {
    let mut out = String::new();
    for b in raw.trim().bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
