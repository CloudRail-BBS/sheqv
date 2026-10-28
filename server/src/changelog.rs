//! 更新日志：从「写死在代码里」搬到库里，后台可增删改。
//!
//! 老数据在 `web/src/lib/changelog.ts`；这边首次启动不做导入——
//! 上线后由管理员在后台补录（或由前端在无数据时回落到内置列表）。

use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub version: String,
    pub title: String,
    pub body: String,
    pub tag: String,
    pub published: bool,
    /// 毫秒时间戳，前端自己格式化
    pub released_at: i64,
}

const COLS: &str = "id, version, title, body, tag, published,
        (extract(epoch FROM released_at) * 1000)::bigint AS released_at";

pub async fn list(pool: &PgPool, published_only: bool) -> Result<Vec<Entry>, sqlx::Error> {
    let sql = if published_only {
        format!(
            "SELECT {COLS} FROM changelog WHERE published ORDER BY released_at DESC, created_at DESC"
        )
    } else {
        format!("SELECT {COLS} FROM changelog ORDER BY released_at DESC, created_at DESC")
    };
    sqlx::query_as(&sql).fetch_all(pool).await
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Entry>, sqlx::Error> {
    sqlx::query_as(&format!("SELECT {COLS} FROM changelog WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub struct NewEntry<'a> {
    pub version: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub tag: &'a str,
    pub published: bool,
}

pub fn validate(title: &str, body: &str) -> Option<&'static str> {
    let t = title.trim().chars().count();
    if !(2..=60).contains(&t) {
        return Some("标题需 2–60 字");
    }
    if body.chars().count() > 8000 {
        return Some("正文不超过 8000 字");
    }
    None
}

pub async fn create(pool: &PgPool, input: NewEntry<'_>) -> Result<Entry, sqlx::Error> {
    let id = ids::next('c');
    sqlx::query(
        "INSERT INTO changelog (id, version, title, body, tag, published, released_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())",
    )
    .bind(&id)
    .bind(input.version.trim())
    .bind(input.title.trim())
    .bind(input.body)
    .bind(input.tag.trim())
    .bind(input.published)
    .execute(pool)
    .await?;
    get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub struct EntryPatch<'a> {
    pub version: Option<&'a str>,
    pub title: Option<&'a str>,
    pub body: Option<&'a str>,
    pub tag: Option<&'a str>,
    pub published: Option<bool>,
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: EntryPatch<'_>,
) -> Result<Option<Entry>, sqlx::Error> {
    let Some(cur) = get(pool, id).await? else {
        return Ok(None);
    };
    sqlx::query(
        "UPDATE changelog SET version=$2, title=$3, body=$4, tag=$5, published=$6, updated_at=now()
          WHERE id=$1",
    )
    .bind(id)
    .bind(patch.version.map(str::trim).unwrap_or(&cur.version))
    .bind(patch.title.map(str::trim).unwrap_or(&cur.title))
    .bind(patch.body.unwrap_or(&cur.body))
    .bind(patch.tag.map(str::trim).unwrap_or(&cur.tag))
    .bind(patch.published.unwrap_or(cur.published))
    .execute(pool)
    .await?;
    get(pool, id).await
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("DELETE FROM changelog WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}
