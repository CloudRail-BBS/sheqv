//! 铁锈战争（Rusted Warfare）的两条外部数据源。
//!
//! 和 Minecraft 那套不一样，这两个站各有各的脾气：
//!
//! - **模组**：rtsbox 的 `POST /api/search_bbs.php`（表单：`bbs_id=4` 模组 / `5` 地图）。
//!   **必须带关键词**：空关键词不返回 JSON，而是一张「暂没有数据」的 HTML 空状态模板。
//!   返回很朴素：`{ title, downurl, img, bbsurl }`。
//! - **地图**：RELAY-CN 地图站 `GET /api/mapLists.php`，用 `type` 分发，
//!   `Authorization: Bearer <token>`。实测 `get` / `random` 可用，`search` 偶发 400「禁用」
//!   或 503（上游认证超时），`batch` 一直禁用 —— 所以搜索失败时回落到 `random`。
//!
//! 地图的下载链接是签名链接（绑定请求方 IP/UA、120 秒过期），前端拿到也没用，
//! 必须由服务端拉流再转给用户，见 `routes::rw::map_download`。

use serde::Serialize;
use serde_json::Value;

/// 两个站都认这个 UA；地图站的签名链接绑定 UA，取签名和下载必须用同一个。
pub const RW_UA: &str = "CloudRail-Community/1.0 (resource library)";

const RTSBOX_SEARCH: &str = "https://www.rtsbox.cn/api/search_bbs.php";
const RW_MAPS: &str = "https://maps.rw.nebulapause.com/api/mapLists.php";

/// rtsbox 的一条模组
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RwMod {
    pub title: String,
    /// 下载直链（cdn.rtsbox.cn）
    pub url: String,
    /// 原帖地址
    pub source_url: String,
    pub icon: String,
    /// 原帖地址里的数字 id，落库当 `source_id`
    pub source_id: String,
}

/// 地图站的一条地图
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RwMap {
    pub id: String,
    pub name: String,
    pub author: String,
    pub thumb: String,
    pub image: String,
    pub downloads: i64,
    pub likes: i64,
    pub dislikes: i64,
    /// 属性标签：PVP / 15000x40000 / 矿点 925 / 4P …
    pub tags: Vec<String>,
    /// 入库时间（毫秒）
    pub uploaded_at: i64,
    pub has_download: bool,
}

/// rtsbox 模组搜索。关键词为空直接返回空列表（接口会回 HTML，解析不了）。
pub async fn search_rtsbox(
    http: &reqwest::Client,
    keyword: &str,
    page: i64,
) -> Result<Vec<RwMod>, String> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Ok(Vec::new());
    }
    let resp = http
        .post(RTSBOX_SEARCH)
        .header("User-Agent", RW_UA)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json")
        .form(&[
            ("bbs_id", "4"),
            ("page", &page.clamp(1, 200).to_string()),
            ("keyword", kw),
        ])
        .send()
        .await
        .map_err(|e| format!("连不上 rtsbox：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("rtsbox 返回 {}", resp.status()));
    }
    let body = resp.text().await.map_err(|e| format!("rtsbox 响应读取失败：{e}"))?;
    let Ok(v) = serde_json::from_str::<Value>(&body) else {
        // 空结果是 HTML 空状态页，不是错误，只是没搜到
        return Ok(Vec::new());
    };
    let rows = v.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    Ok(rows.iter().filter_map(mod_item).collect())
}

fn mod_item(row: &Value) -> Option<RwMod> {
    let title = row.get("title").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    let url = row.get("downurl").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    let source_url = row.get("bbsurl").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    if title.is_empty() || url.is_empty() || source_url.is_empty() {
        return None;
    }
    // https://www.rtsbox.cn/16683.html → 16683
    let source_id = source_url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim_end_matches(".html")
        .to_string();
    if source_id.is_empty() || !source_id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(RwMod {
        title,
        url,
        source_url,
        icon: row.get("img").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        source_id,
    })
}

/// 地图搜索。有关键词走 `search`，失败（禁用 / 上游超时 / 无 token）就回落 `random`。
pub async fn search_rw_maps(
    http: &reqwest::Client,
    token: &str,
    keyword: &str,
    page: i64,
    limit: i64,
) -> Result<Vec<RwMap>, String> {
    let key = token.trim();
    let kw = keyword.trim();
    let limit = limit.clamp(1, 10);

    if !kw.is_empty() {
        let url = format!(
            "{RW_MAPS}?type=search&nameKey={}&page={}&pageSize={}",
            urlencode(kw),
            page.clamp(1, 1000),
            limit
        );
        match maps_request(http, key, &url).await {
            Ok(v) => {
                if let Some(rows) = records(&v) {
                    return Ok(rows.iter().filter_map(map_item).collect());
                }
            }
            // 搜索被拒（400 禁用）或上游认证抽风（503）：别把错误抛给用户，退回随机
            Err(_) => {}
        }
    }

    let url = format!("{RW_MAPS}?type=random&count={limit}");
    let v = maps_request(http, key, &url).await?;
    let rows = records(&v).ok_or_else(|| "地图站返回的格式不对".to_string())?;
    Ok(rows.iter().filter_map(map_item).collect())
}

/// 取一条地图的签名下载地址（120 秒有效、绑定我们的 IP/UA，只能服务端用）
pub async fn map_download_url(http: &reqwest::Client, token: &str, id: &str) -> Result<String, String> {
    let url = format!("{RW_MAPS}?type=get&id={}", urlencode(id));
    let v = maps_request(http, token.trim(), &url).await?;
    let data = v.get("data").ok_or_else(|| "没有这条地图".to_string())?;
    let link = data.get("download_url").and_then(|x| x.as_str()).unwrap_or("");
    if link.is_empty() || !(link.starts_with("http://") || link.starts_with("https://")) {
        return Err("这条地图没有可用下载".into());
    }
    Ok(link.to_string())
}

async fn maps_request(http: &reqwest::Client, token: &str, url: &str) -> Result<Value, String> {
    let mut req = http
        .get(url)
        .header("User-Agent", RW_UA)
        .header("Accept", "application/json");
    if !token.is_empty() {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let resp = req.send().await.map_err(|e| format!("连不上地图站：{e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let parsed = serde_json::from_str::<Value>(&body).ok();
    if !status.is_success() {
        let msg = parsed
            .as_ref()
            .and_then(|v| v.get("msg").or_else(|| v.get("message")))
            .and_then(|x| x.as_str())
            .unwrap_or("地图站返回异常");
        return Err(format!("{msg}（{}）", status.as_u16()));
    }
    parsed.ok_or_else(|| "地图站返回的不是 JSON".to_string())
}

/// 列表在 `data.records`；`get` 直接是 `data` 对象
fn records(v: &Value) -> Option<Vec<Value>> {
    v.get("data")
        .and_then(|d| d.get("records"))
        .and_then(|r| r.as_array())
        .cloned()
}

fn map_item(row: &Value) -> Option<RwMap> {
    let id = row.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
    if id <= 0 {
        return None;
    }
    let meta = row.get("map_metadata");
    let filename = meta
        .and_then(|m| m.get("filename"))
        .and_then(|x| x.as_str())
        .unwrap_or("");
    let name = if filename.is_empty() {
        format!("地图 #{id}")
    } else {
        // 文件名形如 `欧洲… by qwq.tmx`、偶尔还带 `_re` 尾巴，扩展名统一砍掉
        match filename.rsplit_once('.') {
            Some((head, ext)) if head.len() > 1 && ext.len() <= 6 => head.to_string(),
            _ => filename.to_string(),
        }
    };

    // 标签自己组：`map_tags` 里混着触发器分类（检测 / 事件 / unitAdd…），
    // 卡片上只留读者关心的四项 —— 玩法、人数、矿点、尺寸。
    let map_type = row.get("map_type").and_then(|x| x.as_str()).unwrap_or("");
    let mut tags: Vec<String> = Vec::new();
    if !map_type.is_empty() {
        tags.push(
            match map_type.to_ascii_lowercase().as_str() {
                "pvp" => "PVP".to_string(),
                "pve" => "生存".to_string(),
                other => other.to_string(),
            },
        );
    }
    let players = row.get("player_count").and_then(|x| x.as_i64()).unwrap_or(0);
    if players > 0 {
        tags.push(format!("{players}P"));
    }
    let pools = meta
        .and_then(|m| m.get("resource_pool_count"))
        .and_then(|x| x.as_i64())
        .unwrap_or(0);
    if pools > 0 {
        tags.push(format!("矿点 {pools}"));
    }
    let dims = meta.and_then(|m| {
        let w = m.get("image_width").and_then(|x| x.as_i64()).unwrap_or(0);
        let h = m.get("image_height").and_then(|x| x.as_i64()).unwrap_or(0);
        (w > 0 && h > 0).then(|| format!("{w}x{h}"))
    });
    if let Some(d) = dims {
        tags.push(d);
    }
    tags.dedup();

    Some(RwMap {
        id: id.to_string(),
        name,
        author: row
            .get("author_username")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        thumb: row
            .get("thumbnail_url")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        image: row.get("image_url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        downloads: row.get("download_count").and_then(|x| x.as_i64()).unwrap_or(0),
        likes: row.get("like_count").and_then(|x| x.as_i64()).unwrap_or(0),
        dislikes: row.get("dislike_count").and_then(|x| x.as_i64()).unwrap_or(0),
        tags,
        uploaded_at: row
            .get("created_at")
            .and_then(|x| x.as_i64())
            .map(|s| s * 1000)
            .unwrap_or(0),
        has_download: row.get("has_download").and_then(|x| x.as_bool()).unwrap_or(false),
    })
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
