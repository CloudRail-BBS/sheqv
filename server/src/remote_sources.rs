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

/// Modrinth 官方 API 与国内镜像（MCIM）。镜像就是「换域名」，路径与返回完全一致：
/// `api.modrinth.com` → `mod.mcimirror.top/modrinth`，`cdn.modrinth.com` → `mod.mcimirror.top`。
const MODRINTH_API: &str = "https://api.modrinth.com";
const MCIM_API: &str = "https://mod.mcimirror.top/modrinth";
const MODRINTH_CDN: &str = "https://cdn.modrinth.com";
const MCIM_CDN: &str = "https://mod.mcimirror.top";

fn modrinth_base(mirror: bool) -> &'static str {
    if mirror { MCIM_API } else { MODRINTH_API }
}

/// 开了镜像就把图床地址也换掉，否则国内浏览器还得再连一次官方 CDN
pub fn mirror_icon(url: &str, mirror: bool) -> String {
    if mirror && url.starts_with(MODRINTH_CDN) {
        return url.replacen(MODRINTH_CDN, MCIM_CDN, 1);
    }
    url.to_string()
}

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
    /// CurseForge 的数字项目 id（拉详情要用；Modrinth 为 0）
    pub project_id: i64,
}

/// 项目详情：导入时补齐「介绍正文 / 加载器 / 支持版本 / 授权 / 标签」，
/// 让拉进来的条目和站内自己发布的资源长得一样，而不是只有一行简介的空壳。
#[derive(Debug, Clone, Default)]
pub struct RemoteDetail {
    pub summary: String,
    pub body: String,
    pub loaders: String,
    pub game_versions: String,
    pub license: String,
    pub tags: Vec<String>,
    pub icon: String,
}

impl RemoteItem {
    /// 落库时用的规范化分类（CurseForge 的 classId 与 Modrinth 的 project_type 都归到这里）
    pub fn game(&self) -> &'static str {
        "minecraft"
    }
}

fn kind_zh(kind: &str) -> &'static str {
    match kind {
        "mods" => "模组",
        "modpacks" => "整合包",
        "resourcepacks" => "材质",
        "shaderpacks" => "光影",
        "datapacks" => "数据包",
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
    offset: i64,
    mirror: bool,
) -> Result<Vec<RemoteItem>, String> {
    // Modrinth 的分页是 offset，不是页码；单次最多 100 条、offset+limit 上限 1000。
    // 类型必须用 facets 让服务端过滤：只按「下载量」取前 N 条再本地筛，
    // 整合包 / 光影这些会被模组挤掉，永远是空列表。
    let mut url = format!(
        "{}/v2/search?query={}&limit={}&index=downloads&offset={}",
        modrinth_base(mirror),
        urlencode(q),
        limit.clamp(1, 30),
        offset.clamp(0, 900)
    );
    if let Some(want) = kind.map(str::trim).filter(|v| !v.is_empty()) {
        let facets = format!("[[\"project_type:{}\"]]", singular_kind(want));
        url.push_str(&format!("&facets={}", urlencode(&facets)));
    }
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
                icon: mirror_icon(&str_of(h, "icon_url"), mirror),
                downloads: h.get("downloads").and_then(|v| v.as_i64()).unwrap_or(0),
                url: format!("https://modrinth.com/{}/{slug}", singular_kind(&item_kind)),
                kind: item_kind,
                updated: parse_date(h.get("date_modified").and_then(|v| v.as_str())),
                project_id: 0,
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
                project_id: m.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
            })
        })
        .collect())
}

/// 拉项目详情（导入时用）。
///
/// 失败不该阻断导入：调用方拿不到就用搜索结果里的那一行简介兜底。
pub async fn fetch_detail(
    http: &reqwest::Client,
    source: &str,
    source_id: &str,
    project_id: i64,
    api_key: &str,
    mirror: bool,
) -> Result<RemoteDetail, String> {
    match source {
        "modrinth" => modrinth_detail(http, source_id, mirror).await,
        "curseforge" => {
            if project_id <= 0 {
                return Err("缺少 CurseForge 项目编号".into());
            }
            curseforge_detail(http, api_key, project_id).await
        }
        _ => Err("该站点不支持在线拉取详情".into()),
    }
}

async fn modrinth_detail(
    http: &reqwest::Client,
    slug: &str,
    mirror: bool,
) -> Result<RemoteDetail, String> {
    let url = format!("{}/v2/project/{slug}", modrinth_base(mirror));
    let resp = http
        .get(&url)
        .header("User-Agent", "CloudRail-Community/1.0 (resource library)")
        .send()
        .await
        .map_err(|e| format!("连不上 Modrinth：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth 返回 {}", resp.status()));
    }
    let d: Value = resp.json().await.map_err(|e| format!("Modrinth 详情解析失败：{e}"))?;

    let license = {
        let id = d
            .get("license")
            .map(|l| str_of(l, "id"))
            .unwrap_or_default();
        let name = d
            .get("license")
            .map(|l| str_of(l, "name"))
            .unwrap_or_default();
        // `LicenseRef-Polyform-Shield-1.0.0` 这种 SPDX 引用串直接给人看没意义，换成人名版
        if id.starts_with("LicenseRef-") {
            if !name.is_empty() {
                name
            } else {
                id.trim_start_matches("LicenseRef-").replace('-', " ")
            }
        } else if id.is_empty() {
            name
        } else {
            id
        }
    };

    Ok(RemoteDetail {
        summary: clamp_chars(&str_of(&d, "description"), 200),
        body: md_to_text(&str_of(&d, "body")),
        loaders: clamp_chars(&join_list(d.get("loaders"), 6), 60),
        // Modrinth 的版本数组是「从旧到新」，倒过来才是「最新版本在前」
        game_versions: clamp_chars(&join_list_rev(d.get("game_versions"), 12), 120),
        license: clamp_chars(&license, 24),
        tags: tag_list(d.get("categories"), 6, 12),
        icon: mirror_icon(&str_of(&d, "icon_url"), mirror),
    })
}

async fn curseforge_detail(
    http: &reqwest::Client,
    api_key: &str,
    project_id: i64,
) -> Result<RemoteDetail, String> {
    if api_key.trim().is_empty() {
        return Err("未配置 CurseForge API Key".into());
    }
    let base = format!("https://api.curseforge.com/v1/mods/{project_id}");
    let resp = http
        .get(&base)
        .header("x-api-key", api_key.trim())
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("连不上 CurseForge：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("CurseForge 返回 {}", resp.status()));
    }
    let raw: Value = resp.json().await.map_err(|e| format!("CurseForge 详情解析失败：{e}"))?;
    let d = raw.get("data").cloned().unwrap_or(Value::Null);

    // 正文是单独一个接口，且是 HTML（还带 </p> 空段落那种），失败就只用简介
    let body = match http
        .get(format!("{base}/description"))
        .header("x-api-key", api_key.trim())
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.json::<Value>().await {
            Ok(v) => v
                .get("data")
                .and_then(|x| x.as_str())
                .map(html_to_text)
                .unwrap_or_default(),
            Err(_) => String::new(),
        },
        _ => String::new(),
    };

    // latestFilesIndexes 里的 modLoader 是数字枚举，1 Forge / 4 Fabric / 5 Quilt / 6 NeoForge
    let mut loaders: Vec<String> = Vec::new();
    let mut versions: Vec<String> = Vec::new();
    if let Some(list) = d.get("latestFilesIndexes").and_then(|v| v.as_array()) {
        for f in list {
            let name = match f.get("modLoader").and_then(|v| v.as_i64()).unwrap_or(0) {
                1 => "Forge",
                4 => "Fabric",
                5 => "Quilt",
                6 => "NeoForge",
                _ => "",
            };
            if !name.is_empty() && !loaders.iter().any(|x| x == name) {
                loaders.push(name.to_string());
            }
            let gv = str_of(f, "gameVersion");
            if !gv.is_empty() && !is_snapshot(&gv) && !versions.iter().any(|x| x == &gv) {
                versions.push(gv);
            }
        }
    }

    Ok(RemoteDetail {
        summary: clamp_chars(&str_of(&d, "summary"), 200),
        body,
        loaders: clamp_chars(&loaders.join(", "), 60),
        game_versions: clamp_chars(&versions.join(", "), 120),
        license: String::new(),
        tags: tag_list(d.get("categories"), 6, 12),
        icon: d
            .get("logo")
            .and_then(|l| l.get("thumbnailUrl").or_else(|| l.get("url")))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// 字符串数组 → "a, b, c"（最多取 n 个）
fn join_list(v: Option<&Value>, max: usize) -> String {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return String::new();
    };
    arr.iter()
        .filter_map(|x| x.as_str())
        .take(max)
        .collect::<Vec<_>>()
        .join(", ")
}

/// 字符串数组 → "a, b, c"（最多取 n 个，倒序：最新的在前）；跳过快照版
fn join_list_rev(v: Option<&Value>, max: usize) -> String {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return String::new();
    };
    arr.iter()
        .rev()
        .filter_map(|x| x.as_str())
        .filter(|s| !is_snapshot(s))
        .take(max)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Modrinth 的版本数组里混着 `26w14a` / `26.4-snapshot-8`，对读者没意义
fn is_snapshot(v: &str) -> bool {
    let lower = v.to_ascii_lowercase();
    if lower.contains("snapshot") || lower.contains("-pre") || lower.contains("-rc") {
        return true;
    }
    // 26w14a / 24w14potato 这种「周快照」与愚人节版本
    let lower = v.to_ascii_lowercase();
    let b = lower.as_bytes();
    if b.len() >= 5
        && b[0].is_ascii_digit()
        && b[1].is_ascii_digit()
        && b[2] == b'w'
        && b[3].is_ascii_digit()
        && b[4].is_ascii_digit()
    {
        return true;
    }
    false
}

/// 标签数组：能直接映射成 stations 标签的字符串（`[{name}]` 或 `["x"]`）
fn tag_list(v: Option<&Value>, max: usize, max_len: usize) -> Vec<String> {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    let mut out: Vec<String> = Vec::new();
    for item in arr {
        let raw = item
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| str_of(item, "name"));
        let t = raw.trim().trim_start_matches('#').to_string();
        if t.is_empty() || t.chars().count() > max_len || out.iter().any(|x| x == &t) {
            continue;
        }
        out.push(t);
        if out.len() >= max {
            break;
        }
    }
    out
}

fn clamp_chars(s: &str, max: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= max {
        return t.to_string();
    }
    let mut out: String = t.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Markdown 正文 → 纯文本（详情页正文按行渲染纯文本，留着 `##`/`**` 会很脏）
fn md_to_text(raw: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut in_code = false;
    let mut prev_blank = false;

    for line in raw.lines() {
        let t = line.trim();
        if t.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        if t.is_empty() {
            if !prev_blank && !lines.is_empty() {
                lines.push(String::new());
                prev_blank = true;
            }
            continue;
        }
        // 纯分隔线
        if t.len() >= 3 && t.chars().all(|c| matches!(c, '-' | '*' | '_' | '=')) {
            continue;
        }
        // 整行就是一张图（Modrinth 的正文里常见捐赠/社区横幅）：纯文本里没意义
        if t.starts_with("![") && t.contains("](") {
            continue;
        }


        let mut s = t.to_string();
        // 先把图片清掉（含 `[![封面](图)](链接)` 这种嵌套写法），纯文本里没意义
        s = strip_images(&s);
        s = s.trim().to_string();
        if s.is_empty() {
            continue;
        }
        if s.starts_with('#') {
            s = s.trim_start_matches('#').trim().to_string();
        }
        if let Some(rest) = s.strip_prefix('>') {
            s = rest.trim().to_string();
        }
        for bullet in ["- ", "* ", "+ "] {
            if let Some(rest) = s.strip_prefix(bullet) {
                s = format!("· {}", rest.trim());
                break;
            }
        }
        // 正文里混着的 HTML（`<center>` / `<img>` / `<!-- -->`）：先剥标签再当文字
        if s.contains('<') && s.contains('>') {
            s = html_to_text(&s)
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
        }
        if s.is_empty() {
            continue;
        }
        let s = strip_inline_links(&s);
        let s = s
            .replace("**", "")
            .replace("__", "")
            .replace('`', "")
            .replace("~~", "");
        let s = s.trim().to_string();
        if !s.is_empty() {
            lines.push(s);
        }
    }

    while lines.last().map(|l| l.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    clamp_chars(&lines.join("\n"), 4800)
}

/// `![说明](图片地址)` 整段删掉（`[![封面](图)](链接)` 也能吃掉内层）
fn strip_images(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(pos) = rest.find("![") {
        let after = &rest[pos..];
        if let Some(close) = after.find("](") {
            let tail = &after[close + 2..];
            if let Some(end) = tail.find(')') {
                out.push_str(&rest[..pos]);
                rest = &tail[end + 1..];
                continue;
            }
        }
        out.push_str(&rest[..pos + 2]);
        rest = &rest[pos + 2..];
    }
    out.push_str(rest);
    out
}

/// `[文字](地址)` → `文字`；`![图](地址)` → 空白
fn strip_inline_links(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    loop {
        let Some(open) = rest.find('[') else {
            out.push_str(rest);
            break;
        };
        let is_image = open > 0 && rest.as_bytes()[open - 1] == b'!';
        if is_image {
            out.push_str(&rest[..open - 1]);
        } else {
            out.push_str(&rest[..open]);
        }
        let after = &rest[open..];
        let Some(close) = after.find(']') else {
            out.push_str(after);
            break;
        };
        let label = &after[1..close];
        let tail = &after[close + 1..];
        if let Some(t) = tail.strip_prefix('(') {
            if let Some(end) = t.find(')') {
                if !is_image {
                    out.push_str(label);
                }
                rest = &t[end + 1..];
                continue;
            }
        }
        out.push('[');
        rest = after.get(1..).unwrap_or("");
    }
    out
}

/// HTML → 纯文本（CurseForge 的正文是富文本 HTML）
fn html_to_text(raw: &str) -> String {
    let cleaned = strip_blocks(raw, "script");
    let cleaned = strip_blocks(&cleaned, "style");

    let mut text = String::new();
    let mut buf = String::new();
    let mut in_tag = false;
    for c in cleaned.chars() {
        match c {
            '<' => {
                in_tag = true;
                buf.clear();
            }
            '>' => {
                in_tag = false;
                let name = buf
                    .trim_start_matches('/')
                    .split(|c: char| c.is_whitespace() || c == '/')
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let block = matches!(
                    name.as_str(),
                    "br" | "p" | "div" | "li" | "tr" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
                );
                text.push(if block { '\n' } else { ' ' });
            }
            _ if in_tag => buf.push(c),
            _ => text.push(c),
        }
    }
    if in_tag {
        // 没闭合的标签：把缓冲丢掉，别把属性当正文
    }

    let decoded = decode_entities(&text);
    let mut lines: Vec<String> = Vec::new();
    let mut prev_blank = false;
    for line in decoded.lines() {
        let t = line.trim();
        if t.is_empty() {
            if !prev_blank && !lines.is_empty() {
                lines.push(String::new());
                prev_blank = true;
            }
            continue;
        }
        prev_blank = false;
        lines.push(t.to_string());
    }
    while lines.last().map(|l| l.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    clamp_chars(&lines.join("\n"), 4800)
}

fn strip_blocks(raw: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::new();
    let mut rest = raw;
    loop {
        let lower = rest.to_ascii_lowercase();
        let Some(start) = lower.find(&open) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(end) = lower[start..].find(&close) else {
            out.push_str(&rest[start..]);
            break;
        };
        rest = &rest[start + end + close.len()..];
    }
    out
}

fn decode_entities(raw: &str) -> String {
    let mut out = String::new();
    let mut rest = raw;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let Some(semi) = tail.find(';') else {
            out.push('&');
            rest = &rest[pos + 1..];
            continue;
        };
        if semi > 10 {
            out.push('&');
            rest = &rest[pos + 1..];
            continue;
        }
        let name = &tail[1..semi];
        let rep = match name {
            "amp" => Some("&".to_string()),
            "lt" => Some("<".to_string()),
            "gt" => Some(">".to_string()),
            "quot" => Some("\"".to_string()),
            "apos" | "#39" => Some("'".to_string()),
            "nbsp" => Some(" ".to_string()),
            "mdash" => Some("—".to_string()),
            "ndash" => Some("–".to_string()),
            "hellip" => Some("…".to_string()),
            "ldquo" => Some("“".to_string()),
            "rdquo" => Some("”".to_string()),
            "lsquo" => Some("‘".to_string()),
            "rsquo" => Some("’".to_string()),
            _ => {
                let code = if let Some(hex) = name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
                    u32::from_str_radix(hex, 16).ok()
                } else if let Some(dec) = name.strip_prefix('#') {
                    dec.parse::<u32>().ok()
                } else {
                    None
                };
                code.and_then(char::from_u32).map(|c| c.to_string())
            }
        };
        match rep {
            Some(r) => {
                out.push_str(&r);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[pos + 1..];
            }
        }
    }
    out.push_str(rest);
    out
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
