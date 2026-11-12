//! 内容分类：百科与资源库共用一张表，后台可增删改。
//!
//! 设计要点：
//! - `key` 是内容行里存的值，建好就不动；资源库老数据存的就是中文分类名，
//!   所以 key 允许中文，新分类默认拿名字当 key（`?category=地图` 这类链接才好看）。
//! - `label` 只是展示名，改名不影响任何内容行。
//! - 删除时如果还有内容在用，必须指定迁移目标，先搬内容再删分类，
//!   避免出现「分类没了、内容还挂着一个不存在的值」。

use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

pub const SCOPES: [&str; 4] = ["wiki", "resource", "post_section", "post_tag"];

pub fn is_scope(s: &str) -> bool {
    SCOPES.contains(&s)
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub scope: String,
    pub key: String,
    pub label: String,
    pub descr: String,
    pub sort: i32,
    /// 有多少条内容在用（后台列表显示，公开接口恒为 0）
    pub count: i64,
}

const COLS: &str = "c.id, c.scope, c.key, c.label, c.descr, c.sort, 0::bigint AS count";

pub async fn list(pool: &PgPool, scope: &str) -> Result<Vec<Category>, sqlx::Error> {
    sqlx::query_as::<_, Category>(&format!(
        "SELECT {COLS} FROM content_categories c WHERE c.scope = $1 ORDER BY c.sort, c.label"
    ))
    .bind(scope)
    .fetch_all(pool)
    .await
}

/// 后台列表：带上「内容数」，删除前能看清有多少东西要搬
pub async fn admin_list(pool: &PgPool, scope: &str) -> Result<Vec<Category>, sqlx::Error> {
    let sql = match scope {
        "wiki" => "SELECT c.id, c.scope, c.key, c.label, c.descr, c.sort, count(w.id)::bigint AS count
           FROM content_categories c
           LEFT JOIN wiki_entries w ON w.category = c.key
          WHERE c.scope = 'wiki'
          GROUP BY c.id
          ORDER BY c.sort, c.label",
        // 帖子版块：section 存 key
        "post_section" => "SELECT c.id, c.scope, c.key, c.label, c.descr, c.sort, count(p.id)::bigint AS count
           FROM content_categories c
           LEFT JOIN posts p ON p.section = c.key AND p.status = 'published'
          WHERE c.scope = 'post_section'
          GROUP BY c.id
          ORDER BY c.sort, c.label",
        // 帖子标签：tags 是 jsonb 数组，包含就算一条
        "post_tag" => "SELECT c.id, c.scope, c.key, c.label, c.descr, c.sort, count(p.id)::bigint AS count
           FROM content_categories c
           LEFT JOIN posts p ON p.tags @> to_jsonb(c.key) AND p.status = 'published'
          WHERE c.scope = 'post_tag'
          GROUP BY c.id
          ORDER BY c.sort, c.label",
        _ => "SELECT c.id, c.scope, c.key, c.label, c.descr, c.sort, count(r.id)::bigint AS count
           FROM content_categories c
           LEFT JOIN resources r ON r.category = c.key
          WHERE c.scope = 'resource'
          GROUP BY c.id
          ORDER BY c.sort, c.label",
    };
    sqlx::query_as::<_, Category>(sql).fetch_all(pool).await
}

pub async fn keys(pool: &PgPool, scope: &str) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        "SELECT key FROM content_categories WHERE scope = $1 ORDER BY sort, label",
    )
    .bind(scope)
    .fetch_all(pool)
    .await
}

pub async fn known(pool: &PgPool, scope: &str, key: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM content_categories WHERE scope = $1 AND key = $2",
    )
    .bind(scope)
    .bind(key)
    .fetch_one(pool)
    .await?;
    Ok(n > 0)
}

async fn get(pool: &PgPool, scope: &str, key: &str) -> Result<Option<Category>, sqlx::Error> {
    sqlx::query_as::<_, Category>(&format!(
        "SELECT {COLS} FROM content_categories c WHERE c.scope = $1 AND c.key = $2"
    ))
    .bind(scope)
    .bind(key)
    .fetch_optional(pool)
    .await
}

/// 名字 → key：去掉会破坏 URL 的字符，其余原样保留（中文也可以）
fn key_of(label: &str) -> String {
    let cleaned: String = label
        .trim()
        .chars()
        .filter(|c| !c.is_whitespace() && !"/?#&=%\\".contains(*c))
        .take(24)
        .collect();
    if cleaned.is_empty() {
        "cat".to_string()
    } else {
        cleaned
    }
}

async fn next_sort(pool: &PgPool, scope: &str) -> Result<i32, sqlx::Error> {
    let n = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(sort), 0) + 10 FROM content_categories WHERE scope = $1",
    )
    .bind(scope)
    .fetch_one(pool)
    .await?;
    Ok(n)
}

pub async fn create(
    pool: &PgPool,
    scope: &str,
    label: &str,
    descr: &str,
    sort: Option<i32>,
) -> Result<Category, sqlx::Error> {
    let base = key_of(label);
    let mut key = base.clone();
    let mut n = 2;
    while known(pool, scope, &key).await? {
        key = format!("{base}-{n}");
        n += 1;
        if n > 50 {
            return Err(sqlx::Error::Protocol("同名分类太多了，换个名字".into()));
        }
    }
    let sort = match sort {
        Some(s) => s,
        None => next_sort(pool, scope).await?,
    };
    let id = ids::next('c');
    sqlx::query(
        "INSERT INTO content_categories (id, scope, key, label, descr, sort)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&id)
    .bind(scope)
    .bind(&key)
    .bind(label.trim())
    .bind(descr.trim())
    .bind(sort)
    .execute(pool)
    .await?;
    get(pool, scope, &key).await?.ok_or(sqlx::Error::RowNotFound)
}

pub struct Patch<'a> {
    pub label: Option<&'a str>,
    pub descr: Option<&'a str>,
    pub sort: Option<i32>,
}

pub async fn update(
    pool: &PgPool,
    scope: &str,
    key: &str,
    patch: Patch<'_>,
) -> Result<Option<Category>, sqlx::Error> {
    let Some(cur) = get(pool, scope, key).await? else {
        return Ok(None);
    };
    sqlx::query(
        "UPDATE content_categories SET label = $3, descr = $4, sort = $5
          WHERE scope = $1 AND key = $2",
    )
    .bind(scope)
    .bind(key)
    .bind(patch.label.map(str::trim).unwrap_or(&cur.label))
    .bind(patch.descr.map(str::trim).unwrap_or(&cur.descr))
    .bind(patch.sort.unwrap_or(cur.sort))
    .execute(pool)
    .await?;
    get(pool, scope, key).await
}

pub async fn usage(pool: &PgPool, scope: &str, key: &str) -> Result<i64, sqlx::Error> {
    let sql = match scope {
        "wiki" => "SELECT count(*) FROM wiki_entries WHERE category = $1",
        "post_section" => "SELECT count(*) FROM posts WHERE section = $1",
        "post_tag" => "SELECT count(*) FROM posts WHERE tags @> to_jsonb($1::text)",
        _ => "SELECT count(*) FROM resources WHERE category = $1",
    };
    sqlx::query_scalar::<_, i64>(sql)
        .bind(key)
        .fetch_one(pool)
        .await
}

pub struct Removed {
    /// 被搬走的内容条数
    pub moved: i64,
}

pub enum RemoveError {
    /// 还有内容在用，且没指定迁移目标
    InUse(i64),
    /// 迁移目标不存在 / 就是自己
    BadTarget,
    /// 分类本来就不存在
    NotFound,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for RemoveError {
    fn from(e: sqlx::Error) -> Self {
        RemoveError::Db(e)
    }
}

/// 删除分类；`move_to` 为空且仍有内容 → `InUse`，由接口转成 409 让后台选目标。
pub async fn remove(
    pool: &PgPool,
    scope: &str,
    key: &str,
    move_to: Option<&str>,
) -> Result<Removed, RemoveError> {
    let used = usage(pool, scope, key).await?;

    // 标签没有「迁移」的概念：删掉就是把它从所有帖子的数组里摘下来
    if scope == "post_tag" {
        let mut tx = pool.begin().await?;
        sqlx::query("UPDATE posts SET tags = tags - $1 WHERE tags @> to_jsonb($1::text)")
            .bind(key)
            .execute(&mut *tx)
            .await?;
        let out = sqlx::query("DELETE FROM content_categories WHERE scope = $1 AND key = $2")
            .bind(scope)
            .bind(key)
            .execute(&mut *tx)
            .await?;
        if out.rows_affected() == 0 {
            return Err(RemoveError::NotFound);
        }
        tx.commit().await?;
        return Ok(Removed { moved: used });
    }

    let mut moved = 0;
    if used > 0 {
        let Some(target) = move_to.filter(|t| !t.is_empty()) else {
            return Err(RemoveError::InUse(used));
        };
        if target == key || !known(pool, scope, target).await? {
            return Err(RemoveError::BadTarget);
        }
        let mut tx = pool.begin().await?;
        if scope == "post_section" {
            sqlx::query("UPDATE posts SET section = $2 WHERE section = $1")
                .bind(key)
                .bind(target)
                .execute(&mut *tx)
                .await?;
        } else if scope == "wiki" {
            sqlx::query("UPDATE wiki_entries SET category = $2 WHERE category = $1")
                .bind(key)
                .bind(target)
                .execute(&mut *tx)
                .await?;
            // 待审稿也一起搬，否则通过时会写回一个已不存在的分类
            sqlx::query(
                "UPDATE wiki_submissions SET category = $2
                  WHERE category = $1 AND status = 'pending'",
            )
            .bind(key)
            .bind(target)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query("UPDATE resources SET category = $2 WHERE category = $1")
                .bind(key)
                .bind(target)
                .execute(&mut *tx)
                .await?;
        }
        let out = sqlx::query("DELETE FROM content_categories WHERE scope = $1 AND key = $2")
            .bind(scope)
            .bind(key)
            .execute(&mut *tx)
            .await?;
        if out.rows_affected() == 0 {
            return Err(RemoveError::NotFound);
        }
        tx.commit().await?;
        moved = used;
    } else {
        let out = sqlx::query("DELETE FROM content_categories WHERE scope = $1 AND key = $2")
            .bind(scope)
            .bind(key)
            .execute(pool)
            .await?;
        if out.rows_affected() == 0 {
            return Err(RemoveError::NotFound);
        }
    }
    Ok(Removed { moved })
}
