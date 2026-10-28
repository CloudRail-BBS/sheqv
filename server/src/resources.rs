//! 资源库：作者 / 开发团队 / 点赞 / 下载 / 开发者榜。
//!
//! 资源不做人工预审：先发布，后台可下架。这样「发第一个资源 → 自动成为开发者」
//! 的链路才不需要管理员参与。点赞按用户唯一（与帖子计数器不同），
//! 下载按「用户 + 上海时区的一天」去重，避免刷新灌水。

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;

/// 当前支持的分类。新增分类时前后端要一起改（前端是筛选按钮）。
pub const CATEGORIES: [&str; 8] = [
    "地图",
    "整合包",
    "材质",
    "光影",
    "存档",
    "插件",
    "工具",
    "其他",
];

pub const GAMES: [&str; 2] = ["minecraft", "rusted_warfare"];

/// 一个资源最多挂几个文件。再多就应该做版本列表了，不适合塞在一个条目里。
pub const MAX_FILES: usize = 8;

/// 没有手填下载地址时，用第一个附件当主地址（老客户端的单文件下载仍然可用）
pub fn effective_url(url: &str, file_ids: &[String]) -> String {
    let url = url.trim();
    if !url.is_empty() {
        return url.to_string();
    }
    match file_ids.first() {
        Some(first) => format!("/api/v1/resource-files/{first}"),
        None => String::new(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceView {
    pub id: String,
    pub title: String,
    pub summary: String,
    /// 列表不返回正文
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub game: String,
    pub category: String,
    pub tags: Vec<String>,
    pub author_id: String,
    pub author: String,
    /// 作者是否已获得开发者身份
    pub author_developer: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_tag: Option<String>,
    pub url: String,
    pub version: String,
    pub license: String,
    pub size_bytes: i64,
    pub game_versions: String,
    pub loaders: String,
    pub deps: String,
    pub source_url: String,
    /// 附件数量（列表与详情都带，卡片上显示「N 个文件」）
    pub file_count: i64,
    /// 附件明细：只有详情接口返回
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<FileView>,
    pub like_count: i64,
    pub download_count: i64,
    pub liked: bool,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 资源下的一个文件。`url` 由 `file_id` 拼出来，库里不存重复地址。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileView {
    /// 附件 id，下载接口用它定位
    pub id: String,
    pub file_id: String,
    pub name: String,
    pub size: i64,
    pub downloads: i64,
    pub url: String,
}

#[derive(sqlx::FromRow)]
struct FileRow {
    id: String,
    file_id: String,
    name: String,
    size: i64,
    downloads: i64,
}

impl FileRow {
    fn into_view(self) -> FileView {
        FileView {
            url: format!("/api/v1/resource-files/{}", self.file_id),
            id: self.id,
            file_id: self.file_id,
            name: self.name,
            size: self.size,
            downloads: self.downloads,
        }
    }
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    title: String,
    summary: String,
    body: String,
    game: String,
    category: String,
    tags: Value,
    author_id: String,
    author: String,
    author_developer: bool,
    team_id: Option<String>,
    team_name: Option<String>,
    team_tag: Option<String>,
    url: String,
    version: String,
    license: String,
    size_bytes: i64,
    /// 支持的版本（逗号分隔，如 "1.20.1, 1.20.4"）
    game_versions: String,
    /// 加载器 / 运行环境（如 "Forge, Fabric"）
    loaders: String,
    /// 前置依赖说明
    deps: String,
    /// 原帖或百科链接
    source_url: String,
    file_count: i64,
    like_count: i32,
    download_count: i32,
    liked: bool,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

impl Row {
    fn into_view(self, with_body: bool) -> ResourceView {
        ResourceView {
            id: self.id,
            title: self.title,
            summary: self.summary,
            body: with_body.then_some(self.body),
            game: self.game,
            category: self.category,
            tags: strings(&self.tags),
            author_id: self.author_id,
            author: self.author,
            author_developer: self.author_developer,
            team_id: self.team_id,
            team_name: self.team_name,
            team_tag: self.team_tag,
            url: self.url,
            version: self.version,
            license: self.license,
            size_bytes: self.size_bytes,
            game_versions: self.game_versions,
            loaders: self.loaders,
            deps: self.deps,
            source_url: self.source_url,
            file_count: self.file_count,
            files: Vec::new(),
            like_count: self.like_count as i64,
            download_count: self.download_count as i64,
            liked: self.liked,
            status: self.status,
            created_at: self.created_at.timestamp_millis(),
            updated_at: self.updated_at.timestamp_millis(),
        }
    }
}

/// `$1` 固定是「当前用户 id」，匿名时传空串（不会命中任何点赞）
const COLUMNS: &str = "r.id, r.title, r.summary, r.body, r.game, r.category, r.tags,
        r.author_id, u.nickname AS author, (u.developer_at IS NOT NULL) AS author_developer,
        r.team_id, t.name AS team_name, t.tag AS team_tag,
        r.url, r.version, r.license, r.size_bytes,
        r.game_versions, r.loaders, r.deps, r.source_url,
        (SELECT count(*) FROM resource_attachments a WHERE a.resource_id = r.id) AS file_count,
        r.like_count, r.download_count,
        r.status, r.created_at, r.updated_at,
        (rl.user_id IS NOT NULL) AS liked";

const FROM: &str = "FROM resources r
        JOIN users u ON u.id = r.author_id
        LEFT JOIN dev_teams t ON t.id = r.team_id
        LEFT JOIN resource_likes rl ON rl.resource_id = r.id AND rl.user_id = $1";

pub async fn list(
    pool: &PgPool,
    viewer: &str,
    game: Option<&str>,
    category: Option<&str>,
    q: Option<&str>,
    sort: &str,
    limit: i64,
) -> Result<Vec<ResourceView>, sqlx::Error> {
    let order = match sort {
        "likes" => "r.like_count DESC, r.created_at DESC",
        "downloads" => "r.download_count DESC, r.created_at DESC",
        _ => "r.created_at DESC",
    };

    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} {FROM}
          WHERE r.status = 'published'
            AND ($2::text IS NULL OR r.game = $2)
            AND ($3::text IS NULL OR r.category = $3)
            AND (
              $4::text IS NULL
              OR r.title ILIKE '%' || $4 || '%'
              OR r.summary ILIKE '%' || $4 || '%'
              OR r.tags::text ILIKE '%' || $4 || '%'
            )
          ORDER BY {order}
          LIMIT $5"
    ))
    .bind(viewer)
    .bind(game)
    .bind(category)
    .bind(q)
    .bind(limit.clamp(1, 60))
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_view(false)).collect())
}

/// 后台列表：含 hidden，按创建时间倒序
pub async fn admin_list(pool: &PgPool, q: Option<&str>) -> Result<Vec<ResourceView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} {FROM}
          WHERE ($2::text IS NULL OR r.title ILIKE '%' || $2 || '%'
                 OR u.nickname ILIKE '%' || $2 || '%')
          ORDER BY r.created_at DESC
          LIMIT 200"
    ))
    .bind("")
    .bind(q)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_view(false)).collect())
}

/// 某个团队名下的资源（团队详情页）
pub async fn list_by_team(
    pool: &PgPool,
    viewer: &str,
    team_id: &str,
) -> Result<Vec<ResourceView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} {FROM}
          WHERE r.status = 'published' AND r.team_id = $2
          ORDER BY r.created_at DESC
          LIMIT 60"
    ))
    .bind(viewer)
    .bind(team_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_view(false)).collect())
}

pub async fn get(
    pool: &PgPool,
    viewer: &str,
    id: &str,
) -> Result<Option<ResourceView>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} {FROM} WHERE r.id = $2"
    ))
    .bind(viewer)
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    let files: Vec<FileRow> = sqlx::query_as(
        "SELECT id, file_id, name, size, downloads
           FROM resource_attachments WHERE resource_id = $1
          ORDER BY sort, created_at",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let mut view = row.into_view(true);
    view.files = files.into_iter().map(FileRow::into_view).collect();
    Ok(Some(view))
}

pub struct NewResource<'a> {
    pub title: &'a str,
    pub summary: &'a str,
    pub body: &'a str,
    pub game: &'a str,
    pub category: &'a str,
    pub tags: Vec<String>,
    pub team_id: Option<&'a str>,
    pub url: &'a str,
    pub version: &'a str,
    pub license: &'a str,
    pub size_bytes: i64,
    pub game_versions: &'a str,
    pub loaders: &'a str,
    pub deps: &'a str,
    pub source_url: &'a str,
}

/// 返回中文错误；合法返回 `None`
pub fn validate(input: &NewResource<'_>) -> Option<String> {
    let len = |s: &str| s.trim().chars().count();
    if len(input.title) < 2 || len(input.title) > 60 {
        return Some("标题需 2–60 字".into());
    }
    if len(input.summary) > 200 {
        return Some("简介不能超过 200 字".into());
    }
    if len(input.body) > 5000 {
        return Some("正文不能超过 5000 字".into());
    }
    if !GAMES.contains(&input.game) {
        return Some("游戏类型不正确".into());
    }
    if !CATEGORIES.contains(&input.category) {
        return Some("分类不正确".into());
    }
    if input.tags.len() > 6 {
        return Some("标签最多 6 个".into());
    }
    if input.tags.iter().any(|t| t.chars().count() > 12) {
        return Some("单个标签不能超过 12 字".into());
    }
    let url = input.url.trim();
    let is_local_file = url.starts_with("/api/v1/resource-files/");
    if url.len() < 8
        || url.len() > 500
        || (!is_local_file && !(url.starts_with("http://") || url.starts_with("https://")))
    {
        return Some("下载地址必须是 http(s) 链接或本站上传文件".into());
    }
    if len(input.version) > 24 {
        return Some("版本号不能超过 24 字".into());
    }
    if len(input.license) > 24 {
        return Some("授权方式不能超过 24 字".into());
    }
    if input.size_bytes < 0 {
        return Some("文件大小不正确".into());
    }
    if len(input.game_versions) > 120 {
        return Some("支持版本太长了（最多 120 字）".into());
    }
    if len(input.loaders) > 60 {
        return Some("加载器说明最多 60 字".into());
    }
    if len(input.deps) > 300 {
        return Some("依赖说明最多 300 字".into());
    }
    let src = input.source_url.trim();
    if !src.is_empty()
        && (src.len() > 300 || !(src.starts_with("http://") || src.starts_with("https://")))
    {
        return Some("来源链接必须是 http(s) 地址".into());
    }
    None
}

/// 以团队名义发布前，作者必须是该团队成员
pub async fn is_team_member(pool: &PgPool, team_id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
    let hit: Option<i32> =
        sqlx::query_scalar("SELECT 1 FROM dev_team_members WHERE team_id = $1 AND user_id = $2")
            .bind(team_id)
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
    Ok(hit.is_some())
}

/// 把用户上传的文件挂到资源上。不属于该用户的 id 会被跳过，
/// 所以调用方不需要先做一次归属校验。
pub async fn attach(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    resource_id: &str,
    owner_id: &str,
    file_ids: &[String],
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    if file_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids: Vec<&str> = file_ids
        .iter()
        .take(MAX_FILES)
        .map(String::as_str)
        .collect();

    let owned: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT id, name, size FROM resource_files WHERE id = ANY($1) AND user_id = $2",
    )
    .bind(&ids[..])
    .bind(owner_id)
    .fetch_all(&mut **tx)
    .await?;

    let mut attached = Vec::new();
    for (sort, fid) in ids.iter().enumerate() {
        let Some((_, name, size)) = owned.iter().find(|(id, _, _)| id == fid) else {
            continue;
        };
        sqlx::query(
            "INSERT INTO resource_attachments (id, resource_id, file_id, name, size, sort)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (resource_id, file_id) DO NOTHING",
        )
        .bind(crate::ids::next('a'))
        .bind(resource_id)
        .bind(fid)
        .bind(name)
        .bind(size)
        .bind(sort as i32)
        .execute(&mut **tx)
        .await?;
        attached.push((name.clone(), *size));
    }
    Ok(attached)
}

pub async fn create(
    pool: &PgPool,
    author_id: &str,
    input: &NewResource<'_>,
    file_ids: &[String],
) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('r');
    let url = effective_url(input.url, file_ids);
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO resources
             (id, title, summary, body, game, category, tags, author_id, team_id,
              url, version, license, size_bytes, game_versions, loaders, deps, source_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
    )
    .bind(&id)
    .bind(input.title.trim())
    .bind(input.summary.trim())
    .bind(input.body.trim())
    .bind(input.game)
    .bind(input.category)
    .bind(serde_json::json!(input.tags))
    .bind(author_id)
    .bind(input.team_id)
    .bind(&url)
    .bind(input.version.trim())
    .bind(input.license.trim())
    .bind(input.size_bytes)
    .bind(input.game_versions.trim())
    .bind(input.loaders.trim())
    .bind(input.deps.trim())
    .bind(input.source_url.trim())
    .execute(&mut *tx)
    .await?;

    if !file_ids.is_empty() {
        attach(&mut tx, &id, author_id, file_ids).await?;
    }

    // 第一个资源 = 开发者身份。已经有就不动时间。
    sqlx::query("UPDATE users SET developer_at = now() WHERE id = $1 AND developer_at IS NULL")
        .bind(author_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(id)
}

pub struct ResourcePatch<'a> {
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub body: Option<&'a str>,
    pub game: Option<&'a str>,
    pub category: Option<&'a str>,
    pub tags: Option<Vec<String>>,
    pub team_id: Option<Option<&'a str>>,
    pub url: Option<&'a str>,
    pub version: Option<&'a str>,
    pub license: Option<&'a str>,
    pub size_bytes: Option<i64>,
    pub game_versions: Option<&'a str>,
    pub loaders: Option<&'a str>,
    pub deps: Option<&'a str>,
    pub source_url: Option<&'a str>,
    /// Some 表示「整组替换」；None 表示不动附件
    pub file_ids: Option<Vec<String>>,
}

pub async fn patch(
    pool: &PgPool,
    id: &str,
    owner_id: &str,
    patch: ResourcePatch<'_>,
) -> Result<Option<ResourceView>, sqlx::Error> {
    let current = get(pool, "", id).await?;
    let Some(cur) = current else {
        return Ok(None);
    };

    let title = patch.title.unwrap_or(&cur.title);
    let summary = patch.summary.unwrap_or(&cur.summary);
    let body = patch.body.unwrap_or(cur.body.as_deref().unwrap_or(""));
    let game = patch.game.unwrap_or(&cur.game);
    let category = patch.category.unwrap_or(&cur.category);
    let tags = patch.tags.unwrap_or(cur.tags.clone());
    let team_id = match patch.team_id {
        Some(v) => v,
        None => cur.team_id.as_deref(),
    };
    let url = patch.url.unwrap_or(&cur.url);
    let version = patch.version.unwrap_or(&cur.version);
    let license = patch.license.unwrap_or(&cur.license);
    let size_bytes = patch.size_bytes.unwrap_or(cur.size_bytes);
    let game_versions = patch.game_versions.unwrap_or(&cur.game_versions);
    let loaders = patch.loaders.unwrap_or(&cur.loaders);
    let deps = patch.deps.unwrap_or(&cur.deps);
    let source_url = patch.source_url.unwrap_or(&cur.source_url);

    let check = NewResource {
        title,
        summary,
        body,
        game,
        category,
        tags: tags.clone(),
        team_id,
        url,
        version,
        license,
        size_bytes,
        game_versions,
        loaders,
        deps,
        source_url,
    };
    if validate(&check).is_some() {
        return Ok(None);
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE resources SET title=$2, summary=$3, body=$4, game=$5, category=$6, tags=$7,
                team_id=$8, url=$9, version=$10, license=$11, size_bytes=$12,
                game_versions=$13, loaders=$14, deps=$15, source_url=$16, updated_at=now()
          WHERE id=$1",
    )
    .bind(id)
    .bind(title.trim())
    .bind(summary.trim())
    .bind(body.trim())
    .bind(game)
    .bind(category)
    .bind(serde_json::json!(tags))
    .bind(team_id)
    .bind(url.trim())
    .bind(version.trim())
    .bind(license.trim())
    .bind(size_bytes)
    .bind(game_versions.trim())
    .bind(loaders.trim())
    .bind(deps.trim())
    .bind(source_url.trim())
    .execute(&mut *tx)
    .await?;

    // 附件整组替换；没传 fileIds 就保持原样
    if let Some(ids) = patch.file_ids {
        sqlx::query("DELETE FROM resource_attachments WHERE resource_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        attach(&mut tx, id, owner_id, &ids).await?;
        // 主地址指向被换掉的本站文件时，顺手改成第一个附件；
        // 外链保持不变，作者显式传了 url 也以传入值为准。
        let url_is_local = url.trim().starts_with("/api/v1/resource-files/");
        if patch.url.is_none() && (url.trim().is_empty() || url_is_local) {
            if let Some(first) = ids.first() {
                sqlx::query("UPDATE resources SET url = $2 WHERE id = $1")
                    .bind(id)
                    .bind(format!("/api/v1/resource-files/{first}"))
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    tx.commit().await?;
    get(pool, "", id).await
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM resources WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 切换点赞。返回 (已点赞, 最新点赞数)
pub async fn toggle_like(
    pool: &PgPool,
    resource_id: &str,
    user_id: &str,
) -> Result<Option<(bool, i64)>, sqlx::Error> {
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM resources WHERE id = $1")
        .bind(resource_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Ok(None);
    }

    let mut tx = pool.begin().await?;
    let removed: Option<String> = sqlx::query_scalar(
        "DELETE FROM resource_likes WHERE resource_id = $1 AND user_id = $2 RETURNING resource_id",
    )
    .bind(resource_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;

    let liked = removed.is_none();
    if liked {
        sqlx::query(
            "INSERT INTO resource_likes (resource_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING",
        )
        .bind(resource_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    }

    // 以真实行数回填，避免并发下计数器漂移
    let count: i64 = sqlx::query_scalar(
        "UPDATE resources SET like_count = (SELECT count(*) FROM resource_likes WHERE resource_id = $1)
          WHERE id = $1 RETURNING like_count::bigint",
    )
    .bind(resource_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Some((liked, count)))
}

/// 记录一次下载：同一用户同一天只加一次
async fn bump_download(
    pool: &PgPool,
    resource_id: &str,
    user_id: Option<&str>,
) -> Result<Option<i64>, sqlx::Error> {
    let initial: Option<i32> = sqlx::query_scalar(
        "SELECT download_count FROM resources WHERE id = $1 AND status = 'published'",
    )
    .bind(resource_id)
    .fetch_optional(pool)
    .await?;
    let Some(initial) = initial else {
        return Ok(None);
    };

    let mut count = initial as i64;
    if let Some(uid) = user_id {
        let fresh: Option<String> = sqlx::query_scalar(
            "INSERT INTO resource_downloads (resource_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING RETURNING resource_id",
        )
        .bind(resource_id)
        .bind(uid)
        .fetch_optional(pool)
        .await?;

        if fresh.is_some() {
            let next: i32 = sqlx::query_scalar(
                "UPDATE resources SET download_count = download_count + 1
                  WHERE id = $1 RETURNING download_count",
            )
            .bind(resource_id)
            .fetch_one(pool)
            .await?;
            count = next as i64;
        }
    }

    Ok(Some(count))
}

/// 记录一次下载：返回 (下载地址, 最新下载数)
pub async fn download(
    pool: &PgPool,
    resource_id: &str,
    user_id: Option<&str>,
) -> Result<Option<(String, i64)>, sqlx::Error> {
    let url: Option<String> =
        sqlx::query_scalar("SELECT url FROM resources WHERE id = $1 AND status = 'published'")
            .bind(resource_id)
            .fetch_optional(pool)
            .await?;
    let Some(url) = url else { return Ok(None) };
    let count = bump_download(pool, resource_id, user_id).await?.unwrap_or(0);
    Ok(Some((url, count)))
}

/// 下载资源里的某个附件：返回 (下载地址, 该文件下载数, 资源总下载数)
pub async fn download_file(
    pool: &PgPool,
    resource_id: &str,
    attachment_id: &str,
    user_id: Option<&str>,
) -> Result<Option<(String, i64, i64)>, sqlx::Error> {
    let file_id: Option<String> = sqlx::query_scalar(
        "SELECT a.file_id FROM resource_attachments a
           JOIN resources r ON r.id = a.resource_id
          WHERE a.id = $1 AND a.resource_id = $2 AND r.status = 'published'",
    )
    .bind(attachment_id)
    .bind(resource_id)
    .fetch_optional(pool)
    .await?;
    let Some(file_id) = file_id else {
        return Ok(None);
    };

    let file_downloads: i64 = sqlx::query_scalar(
        "UPDATE resource_attachments SET downloads = downloads + 1
          WHERE id = $1 RETURNING downloads",
    )
    .bind(attachment_id)
    .fetch_one(pool)
    .await?;
    let total = bump_download(pool, resource_id, user_id).await?.unwrap_or(0);

    Ok(Some((
        format!("/api/v1/resource-files/{file_id}"),
        file_downloads,
        total,
    )))
}

/// 后台下架 / 恢复
pub async fn set_status(pool: &PgPool, id: &str, status: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("UPDATE resources SET status = $2, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(status)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/* ── 开发者榜 ───────────────────────────── */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevRow {
    pub rank: i64,
    pub user_id: String,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    pub resources: i64,
    pub downloads: i64,
    pub likes: i64,
    /// 下载 + 点赞 × 3，榜单排序用
    pub score: i64,
    pub since: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevTeamRow {
    pub rank: i64,
    pub team_id: String,
    pub name: String,
    pub tag: String,
    pub color: String,
    /// 团队头像；空则前端用简称色块
    #[serde(skip_serializing_if = "String::is_empty")]
    pub logo: String,
    pub members: i64,
    pub resources: i64,
    pub downloads: i64,
    pub likes: i64,
    pub score: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct DevDbRow {
    user_id: String,
    nickname: String,
    team_name: Option<String>,
    resources: i64,
    downloads: i64,
    likes: i64,
    score: i64,
    since: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
struct DevTeamDbRow {
    team_id: String,
    name: String,
    tag: String,
    color: String,
    logo: String,
    members: i64,
    resources: i64,
    downloads: i64,
    likes: i64,
    score: i64,
}

/// 开发者个人榜：按资源下载 + 点赞折算分排序
pub async fn developer_board(pool: &PgPool, limit: i64) -> Result<Vec<DevRow>, sqlx::Error> {
    let rows: Vec<DevDbRow> = sqlx::query_as(
        "SELECT u.id AS user_id, u.nickname,
                (SELECT t.name FROM dev_team_members m JOIN dev_teams t ON t.id = m.team_id
                  WHERE m.user_id = u.id ORDER BY m.joined_at ASC LIMIT 1) AS team_name,
                count(r.id)::bigint AS resources,
                COALESCE(sum(r.download_count), 0)::bigint AS downloads,
                COALESCE(sum(r.like_count), 0)::bigint AS likes,
                COALESCE(sum(r.download_count + r.like_count * 3), 0)::bigint AS score,
                u.developer_at AS since
           FROM users u
           JOIN resources r ON r.author_id = u.id AND r.status = 'published'
          WHERE u.developer_at IS NOT NULL
          GROUP BY u.id
          ORDER BY score DESC, downloads DESC, likes DESC, u.developer_at ASC
          LIMIT $1",
    )
    .bind(limit.clamp(1, 100))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, r)| DevRow {
            rank: i as i64 + 1,
            user_id: r.user_id,
            nickname: r.nickname,
            team_name: r.team_name,
            resources: r.resources,
            downloads: r.downloads,
            likes: r.likes,
            score: r.score,
            since: r.since.timestamp_millis(),
        })
        .collect())
}

/// 开发团队榜：只统计挂在团队名下的资源
pub async fn dev_team_board(pool: &PgPool, limit: i64) -> Result<Vec<DevTeamRow>, sqlx::Error> {
    let rows: Vec<DevTeamDbRow> = sqlx::query_as(
        "SELECT t.id AS team_id, t.name, t.tag, t.color, t.logo,
                (SELECT count(*) FROM dev_team_members m WHERE m.team_id = t.id)::bigint AS members,
                count(r.id)::bigint AS resources,
                COALESCE(sum(r.download_count), 0)::bigint AS downloads,
                COALESCE(sum(r.like_count), 0)::bigint AS likes,
                COALESCE(sum(r.download_count + r.like_count * 3), 0)::bigint AS score
           FROM dev_teams t
           JOIN resources r ON r.team_id = t.id AND r.status = 'published'
          GROUP BY t.id
          ORDER BY score DESC, downloads DESC, likes DESC, t.created_at ASC
          LIMIT $1",
    )
    .bind(limit.clamp(1, 100))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, r)| DevTeamRow {
            rank: i as i64 + 1,
            team_id: r.team_id,
            name: r.name,
            tag: r.tag,
            color: r.color,
            logo: r.logo,
            members: r.members,
            resources: r.resources,
            downloads: r.downloads,
            likes: r.likes,
            score: r.score,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> NewResource<'static> {
        NewResource {
            title: "云轨红石工具箱",
            summary: "常用红石模板",
            body: "",
            game: "minecraft",
            category: "工具",
            tags: vec!["红石".into()],
            team_id: None,
            url: "https://example.com/a.zip",
            version: "1.0.0",
            license: "MIT",
            size_bytes: 1024,
        }
    }

    #[test]
    fn accepts_valid_resource() {
        assert!(validate(&base()).is_none());
    }

    #[test]
    fn rejects_non_http_url() {
        let mut r = base();
        r.url = "javascript:alert(1)";
        assert!(validate(&r).is_some());
    }

    #[test]
    fn rejects_unknown_game_and_category() {
        let mut r = base();
        r.game = "starcraft";
        assert!(validate(&r).is_some());

        let mut r = base();
        r.category = "外挂";
        assert!(validate(&r).is_some());
    }

    #[test]
    fn caps_tags_and_title() {
        let mut r = base();
        r.tags = (0..7).map(|i| format!("t{i}")).collect();
        assert!(validate(&r).is_some());

        let mut r = base();
        r.title = "x";
        assert!(validate(&r).is_some());
    }
}
