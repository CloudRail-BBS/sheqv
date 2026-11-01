//! 社区百科：词条是**站长维护的说明文档**，不是用户生成内容。
//!
//! 结构上刻意与帖子分开：不走审核、不参与积分、没有点赞，
//! 只读接口公开，写接口全部需要 `AdminActor`。

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;

pub const CATEGORIES: [&str; 5] = ["intro", "mechanics", "server", "dev", "community"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiSummary {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub category: String,
    pub tags: Vec<String>,
    pub views: i64,
    /// 后台用来区分草稿；公开列表里恒为 true
    pub published: bool,
    /// 毫秒
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiEntry {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub category: String,
    pub tags: Vec<String>,
    pub views: i64,
    pub author: String,
    pub author_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 历史版本条目（列表用，不带正文）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionBrief {
    pub id: String,
    pub title: String,
    pub editor: String,
    pub created_at: i64,
}

/// 历史版本详情
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub category: String,
    pub tags: Vec<String>,
    pub editor: String,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    slug: String,
    title: String,
    summary: String,
    body: String,
    category: String,
    tags: Value,
    views: i64,
    published: bool,
    author_id: String,
    author: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn tags_of(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .take(5)
                .collect()
        })
        .unwrap_or_default()
}

impl Row {
    fn summary(self) -> WikiSummary {
        WikiSummary {
            id: self.id,
            slug: self.slug,
            title: self.title,
            summary: self.summary,
            category: self.category,
            tags: tags_of(&self.tags),
            views: self.views,
            published: self.published,
            updated_at: self.updated_at.timestamp_millis(),
        }
    }

    fn entry(self) -> WikiEntry {
        WikiEntry {
            id: self.id,
            slug: self.slug,
            title: self.title,
            summary: self.summary,
            body: self.body,
            category: self.category,
            tags: tags_of(&self.tags),
            views: self.views,
            author: self.author,
            author_id: self.author_id,
            created_at: self.created_at.timestamp_millis(),
            updated_at: self.updated_at.timestamp_millis(),
        }
    }
}

const SQL: &str = "SELECT w.id, w.slug, w.title, w.summary, w.body, w.category, w.tags,
        w.views, w.published, w.author_id, u.nickname AS author, w.created_at, w.updated_at
   FROM wiki_entries w JOIN users u ON u.id = w.author_id";

/// 公开列表：支持分类与关键词。**已发布的才出现**。
pub async fn list(
    pool: &PgPool,
    category: Option<&str>,
    q: Option<&str>,
) -> Result<Vec<WikiSummary>, sqlx::Error> {
    let cat = category.filter(|c| CATEGORIES.contains(c));
    let keyword = q.map(str::trim).filter(|v| !v.is_empty());
    let pattern = keyword.map(|k| format!("%{}%", escape_like(k)));

    let rows: Vec<Row> = match (cat, pattern) {
        (Some(cat), Some(pat)) => {
            sqlx::query_as(&format!(
                "{SQL}
                 WHERE w.published AND w.category = $1
                   AND (w.title ILIKE $2 ESCAPE '\\' OR w.summary ILIKE $2 ESCAPE '\\'
                        OR w.body ILIKE $2 ESCAPE '\\')
                 ORDER BY w.sort DESC, w.updated_at DESC"
            ))
            .bind(cat)
            .bind(pat)
            .fetch_all(pool)
            .await?
        }
        (Some(cat), None) => {
            sqlx::query_as(&format!(
                "{SQL} WHERE w.published AND w.category = $1
                 ORDER BY w.sort DESC, w.updated_at DESC"
            ))
            .bind(cat)
            .fetch_all(pool)
            .await?
        }
        (None, Some(pat)) => {
            sqlx::query_as(&format!(
                "{SQL}
                 WHERE w.published
                   AND (w.title ILIKE $1 ESCAPE '\\' OR w.summary ILIKE $1 ESCAPE '\\'
                        OR w.body ILIKE $1 ESCAPE '\\')
                 ORDER BY w.sort DESC, w.updated_at DESC"
            ))
            .bind(pat)
            .fetch_all(pool)
            .await?
        }
        (None, None) => {
            sqlx::query_as(&format!(
                "{SQL} WHERE w.published ORDER BY w.sort DESC, w.updated_at DESC"
            ))
            .fetch_all(pool)
            .await?
        }
    };

    Ok(rows.into_iter().map(Row::summary).collect())
}

/// 打开词条：顺手把浏览数 +1，和帖子详情一致
pub async fn get(pool: &PgPool, slug: &str) -> Result<Option<WikiEntry>, sqlx::Error> {
    sqlx::query("UPDATE wiki_entries SET views = views + 1 WHERE slug = $1 AND published")
        .bind(slug)
        .execute(pool)
        .await?;

    let row: Option<Row> =
        sqlx::query_as(&format!("{SQL} WHERE w.slug = $1 AND w.published"))
            .bind(slug)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(Row::entry))
}

/// 同分类的其他词条（详情页底部推荐）
pub async fn related(
    pool: &PgPool,
    category: &str,
    exclude_id: &str,
    limit: i64,
) -> Result<Vec<WikiSummary>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SQL}
          WHERE w.published AND w.category = $1 AND w.id <> $2
          ORDER BY w.sort DESC, w.updated_at DESC
          LIMIT $3"
    ))
    .bind(category)
    .bind(exclude_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::summary).collect())
}

/// 后台：不带 published 过滤，草稿也要能编辑；**带正文**，编辑器不用再拉一次
pub async fn admin_list(pool: &PgPool) -> Result<Vec<WikiEntry>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SQL} ORDER BY w.updated_at DESC LIMIT 200"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::entry).collect())
}

pub struct NewEntry<'a> {
    pub title: &'a str,
    pub slug: &'a str,
    pub summary: &'a str,
    pub body: &'a str,
    pub category: &'a str,
    pub tags: Vec<String>,
    pub published: bool,
    pub author_id: &'a str,
}

pub async fn create(pool: &PgPool, input: &NewEntry<'_>) -> Result<Option<WikiEntry>, sqlx::Error> {
    let id = crate::ids::next('w');
    let slug = if input.slug.trim().is_empty() {
        id.clone()
    } else {
        input.slug.trim().to_string()
    };

    let done = sqlx::query(
        "INSERT INTO wiki_entries
             (id, slug, title, summary, body, category, tags, author_id, published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug) DO NOTHING",
    )
    .bind(&id)
    .bind(&slug)
    .bind(input.title.trim())
    .bind(input.summary.trim())
    .bind(input.body)
    .bind(input.category)
    .bind(Value::Array(input.tags.iter().map(|t| Value::String(t.clone())).collect()))
    .bind(input.author_id)
    .bind(input.published)
    .execute(pool)
    .await?;

    if done.rows_affected() == 0 {
        return Ok(None);
    }

    // 新建后按 id 取，slug 可能是自动生成的
    let row: Option<Row> = sqlx::query_as(&format!("{SQL} WHERE w.id = $1"))
        .bind(&id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::entry))
}

pub struct PatchEntry<'a> {
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub body: Option<&'a str>,
    pub category: Option<&'a str>,
    pub tags: Option<Vec<String>>,
    pub published: Option<bool>,
}

/// 保存前的快照：把当前内容原样写进 wiki_revisions
async fn snapshot(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entry_id: &str,
    editor_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO wiki_revisions (id, entry_id, title, summary, body, category, tags, editor_id)
         SELECT $1, id, title, summary, body, category, tags, $2
           FROM wiki_entries WHERE id = $3",
    )
    .bind(crate::ids::next('r'))
    .bind(editor_id)
    .bind(entry_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: &PatchEntry<'_>,
    editor_id: &str,
) -> Result<Option<WikiEntry>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    snapshot(&mut tx, id, editor_id).await?;

    let done = sqlx::query(
        "UPDATE wiki_entries SET
             title      = COALESCE($2, title),
             summary    = COALESCE($3, summary),
             body       = COALESCE($4, body),
             category   = COALESCE($5, category),
             tags       = COALESCE($6, tags),
             published  = COALESCE($7, published),
             updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(patch.title.map(str::trim))
    .bind(patch.summary.map(str::trim))
    .bind(patch.body)
    .bind(patch.category)
    .bind(
        patch
            .tags
            .as_ref()
            .map(|t| Value::Array(t.iter().map(|s| Value::String(s.clone())).collect())),
    )
    .bind(patch.published)
    .execute(&mut *tx)
    .await?;

    if done.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(None);
    }
    tx.commit().await?;

    let row: Option<Row> = sqlx::query_as(&format!("{SQL} WHERE w.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::entry))
}

/// 某个词条的历史版本（新的在前）
pub async fn revisions(
    pool: &PgPool,
    entry_id: &str,
) -> Result<Vec<RevisionBrief>, sqlx::Error> {
    let rows: Vec<(String, String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT r.id, r.title, u.nickname, r.created_at
           FROM wiki_revisions r JOIN users u ON u.id = r.editor_id
          WHERE r.entry_id = $1
          ORDER BY r.created_at DESC
          LIMIT 100",
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, title, editor, created_at)| RevisionBrief {
            id,
            title,
            editor,
            created_at: created_at.timestamp_millis(),
        })
        .collect())
}

pub async fn revision(
    pool: &PgPool,
    entry_id: &str,
    rev_id: &str,
) -> Result<Option<Revision>, sqlx::Error> {
    let row: Option<(String, String, String, String, String, Value, String, DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT r.id, r.title, r.summary, r.body, r.category, r.tags, u.nickname, r.created_at
               FROM wiki_revisions r JOIN users u ON u.id = r.editor_id
              WHERE r.entry_id = $1 AND r.id = $2",
        )
        .bind(entry_id)
        .bind(rev_id)
        .fetch_optional(pool)
        .await?;

    Ok(row.map(|(id, title, summary, body, category, tags, editor, created_at)| Revision {
        id,
        title,
        summary,
        body,
        category,
        tags: tags_of(&tags),
        editor,
        created_at: created_at.timestamp_millis(),
    }))
}

/// 回滚到某个历史版本：先把当前内容存快照，再把版本内容写回词条。
pub async fn restore(
    pool: &PgPool,
    entry_id: &str,
    rev_id: &str,
    editor_id: &str,
) -> Result<Option<WikiEntry>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    snapshot(&mut tx, entry_id, editor_id).await?;

    let done = sqlx::query(
        "UPDATE wiki_entries w SET
             title = r.title, summary = r.summary, body = r.body,
             category = r.category, tags = r.tags, updated_at = now()
           FROM wiki_revisions r
          WHERE w.id = $1 AND r.id = $2 AND r.entry_id = w.id",
    )
    .bind(entry_id)
    .bind(rev_id)
    .execute(&mut *tx)
    .await?;

    if done.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(None);
    }
    tx.commit().await?;

    let row: Option<Row> = sqlx::query_as(&format!("{SQL} WHERE w.id = $1"))
        .bind(entry_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::entry))
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM wiki_entries WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 只取 id（历史版本接口用，避免 GET 详情那样把浏览数 +1）
pub async fn id_by_slug(pool: &PgPool, slug: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM wiki_entries WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await
}

pub async fn count(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*) FROM wiki_entries WHERE published")
        .fetch_one(pool)
        .await
}

/// 转义 LIKE 通配符：用户搜「100% 纯度」时不能当通配符用
pub fn escape_like(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '\\' | '%' | '_' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}
