//! 社区新闻：栏目可自定义，新闻按栏目归档，报刊页按时间区间现场拼版。
//!
//! 没有「一期报纸」这张表：报刊是查询结果的一种排版，范围一改就重排，
//! 不会出现「新闻改了、报纸还是旧的」这种不一致。

use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub intro: String,
    pub sort: i32,
    /// 已发布的新闻条数，前台栏目胶囊上显示
    pub count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub id: String,
    pub column_id: Option<String>,
    pub column_name: Option<String>,
    pub column_slug: Option<String>,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub cover: String,
    pub author: String,
    pub source: String,
    pub published: bool,
    /// 毫秒时间戳，前端自己格式化
    pub published_at: i64,
}

const COLUMN_COLS: &str = "c.id, c.name, c.slug, c.intro, c.sort,
    (SELECT count(*) FROM news_articles a WHERE a.column_id = c.id AND a.published)::bigint AS count";

const ARTICLE_COLS: &str = "a.id, a.column_id, c.name AS column_name, c.slug AS column_slug,
    a.title, a.summary, a.body, a.cover, a.author, a.source, a.published,
    (extract(epoch FROM a.published_at) * 1000)::bigint AS published_at";

// ── 栏目 ───────────────────────────────────────────────

pub async fn list_columns(pool: &PgPool) -> Result<Vec<Column>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMN_COLS} FROM news_columns c ORDER BY c.sort, c.name"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get_column(pool: &PgPool, id: &str) -> Result<Option<Column>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMN_COLS} FROM news_columns c WHERE c.id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub fn validate_column(name: &str, intro: &str) -> Option<&'static str> {
    let n = name.trim().chars().count();
    if !(1..=12).contains(&n) {
        return Some("栏目名 1–12 字");
    }
    if intro.chars().count() > 200 {
        return Some("栏目说明不超过 200 字");
    }
    None
}

/// 只留小写字母、数字与连字符；中文名留空时由调用方生成一个稳定 slug
pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    for ch in input.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if (ch == '-' || ch == '_' || ch == ' ') && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

pub struct NewColumn<'a> {
    pub name: &'a str,
    pub slug: &'a str,
    pub intro: &'a str,
    pub sort: i32,
}

pub async fn create_column(pool: &PgPool, input: NewColumn<'_>) -> Result<Column, sqlx::Error> {
    let id = ids::next('k');
    sqlx::query(
        "INSERT INTO news_columns (id, name, slug, intro, sort) VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(input.slug)
    .bind(input.intro.trim())
    .bind(input.sort)
    .execute(pool)
    .await?;
    get_column(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub struct ColumnPatch<'a> {
    pub name: Option<&'a str>,
    pub slug: Option<&'a str>,
    pub intro: Option<&'a str>,
    pub sort: Option<i32>,
}

pub async fn update_column(
    pool: &PgPool,
    id: &str,
    patch: ColumnPatch<'_>,
) -> Result<Option<Column>, sqlx::Error> {
    let Some(cur) = get_column(pool, id).await? else {
        return Ok(None);
    };
    sqlx::query("UPDATE news_columns SET name=$2, slug=$3, intro=$4, sort=$5 WHERE id=$1")
        .bind(id)
        .bind(patch.name.map(str::trim).unwrap_or(&cur.name))
        .bind(patch.slug.map(str::trim).unwrap_or(&cur.slug))
        .bind(patch.intro.map(str::trim).unwrap_or(&cur.intro))
        .bind(patch.sort.unwrap_or(cur.sort))
        .execute(pool)
        .await?;
    get_column(pool, id).await
}

pub async fn delete_column(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("DELETE FROM news_columns WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}

// ── 新闻 ───────────────────────────────────────────────

pub struct Filter<'a> {
    /// 栏目 slug；None 为全部
    pub column: Option<&'a str>,
    /// 起始时间（毫秒，含）
    pub from: Option<i64>,
    /// 结束时间（毫秒，含）
    pub to: Option<i64>,
    pub limit: i64,
}

pub async fn list(
    pool: &PgPool,
    published_only: bool,
    filter: Filter<'_>,
) -> Result<Vec<Article>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {ARTICLE_COLS}
           FROM news_articles a
           LEFT JOIN news_columns c ON c.id = a.column_id
          WHERE ($1::boolean = false OR a.published)
            AND ($2::text IS NULL OR c.slug = $2)
            AND ($3::bigint IS NULL OR a.published_at >= to_timestamp($3::bigint / 1000.0))
            AND ($4::bigint IS NULL OR a.published_at <  to_timestamp($4::bigint / 1000.0))
          ORDER BY a.published_at DESC
          LIMIT $5"
    ))
    .bind(published_only)
    .bind(filter.column)
    .bind(filter.from)
    .bind(filter.to)
    .bind(filter.limit)
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Article>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {ARTICLE_COLS}
           FROM news_articles a
           LEFT JOIN news_columns c ON c.id = a.column_id
          WHERE a.id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub fn validate(title: &str, summary: &str, body: &str) -> Option<&'static str> {
    let t = title.trim().chars().count();
    if !(2..=80).contains(&t) {
        return Some("标题需 2–80 字");
    }
    if summary.chars().count() > 200 {
        return Some("导语不超过 200 字");
    }
    if body.chars().count() > 20000 {
        return Some("正文不超过 20000 字");
    }
    None
}

pub struct NewArticle<'a> {
    pub column_id: Option<&'a str>,
    pub title: &'a str,
    pub summary: &'a str,
    pub body: &'a str,
    pub cover: &'a str,
    pub author: &'a str,
    pub source: &'a str,
    pub published: bool,
}

pub async fn create(pool: &PgPool, input: NewArticle<'_>) -> Result<Article, sqlx::Error> {
    let id = ids::next('n');
    sqlx::query(
        "INSERT INTO news_articles
            (id, column_id, title, summary, body, cover, author, source, published, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())",
    )
    .bind(&id)
    .bind(input.column_id)
    .bind(input.title.trim())
    .bind(input.summary.trim())
    .bind(input.body)
    .bind(input.cover.trim())
    .bind(input.author.trim())
    .bind(input.source.trim())
    .bind(input.published)
    .execute(pool)
    .await?;
    get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub struct ArticlePatch<'a> {
    pub column_id: Option<Option<&'a str>>,
    pub title: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub body: Option<&'a str>,
    pub cover: Option<&'a str>,
    pub author: Option<&'a str>,
    pub source: Option<&'a str>,
    pub published: Option<bool>,
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: ArticlePatch<'_>,
) -> Result<Option<Article>, sqlx::Error> {
    let Some(cur) = get(pool, id).await? else {
        return Ok(None);
    };
    // 从草稿改成发布时，把发布时间推到现在，否则报纸区间会漏掉它
    let publish_now = matches!(patch.published, Some(true)) && !cur.published;
    sqlx::query(
        "UPDATE news_articles
            SET column_id=$2, title=$3, summary=$4, body=$5, cover=$6, author=$7, source=$8,
                published=$9, published_at = CASE WHEN $10 THEN now() ELSE published_at END,
                updated_at=now()
          WHERE id=$1",
    )
    .bind(id)
    .bind(patch.column_id.unwrap_or(cur.column_id.as_deref()))
    .bind(patch.title.map(str::trim).unwrap_or(&cur.title))
    .bind(patch.summary.map(str::trim).unwrap_or(&cur.summary))
    .bind(patch.body.unwrap_or(&cur.body))
    .bind(patch.cover.map(str::trim).unwrap_or(&cur.cover))
    .bind(patch.author.map(str::trim).unwrap_or(&cur.author))
    .bind(patch.source.map(str::trim).unwrap_or(&cur.source))
    .bind(patch.published.unwrap_or(cur.published))
    .bind(publish_now)
    .execute(pool)
    .await?;
    get(pool, id).await
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("DELETE FROM news_articles WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}
