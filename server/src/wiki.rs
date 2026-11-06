//! 社区百科：词条是**站长维护的说明文档**，不是用户生成内容。
//!
//! 结构上刻意与帖子分开：不走审核、不参与积分、没有点赞，
//! 只读接口公开，写接口全部需要 `AdminActor`。

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;

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
    /// 后台列表用：草稿在前台不可见
    pub published: bool,
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
            published: self.published,
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
    // 分类由后台维护，这里不再白名单过滤；只挡明显不合理的超长值
    let cat = category
        .map(str::trim)
        .filter(|c| !c.is_empty() && c.chars().count() <= 32);
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

/* ── 投稿与审核 ─────────────────────────────────────────
   词条仍是「公开内容」，但写入不再只有管理员：
   任何登录用户都可以提交新建或修改，先进 wiki_submissions，
   审核通过后才会写进 wiki_entries（并留下历史版本）。 */

/// 列表用：不带正文，够审核队列扫一眼
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionBrief {
    pub id: String,
    /// 空 = 新词条，非空 = 修改已有词条
    pub entry_id: Option<String>,
    /// 修改稿指向的词条 slug，前端用来跳转
    pub entry_slug: Option<String>,
    pub title: String,
    pub summary: String,
    pub category: String,
    pub status: String,
    /// 审核意见（拒绝原因 / 通过备注）
    pub note: String,
    pub author: String,
    pub author_id: String,
    pub created_at: i64,
    pub reviewed_at: Option<i64>,
}

/// 详情：带正文与标签，审核时看全文
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Submission {
    #[serde(flatten)]
    pub brief: SubmissionBrief,
    pub body: String,
    pub tags: Vec<String>,
}

#[derive(sqlx::FromRow)]
struct SubmissionRow {
    id: String,
    entry_id: Option<String>,
    entry_slug: Option<String>,
    title: String,
    summary: String,
    body: String,
    category: String,
    tags: Value,
    status: String,
    note: String,
    author_id: String,
    author: String,
    created_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
}

const SUB_SQL: &str = "SELECT s.id, s.entry_id, w.slug AS entry_slug, s.title, s.summary, s.body,
        s.category, s.tags, s.status, s.note, s.author_id, u.nickname AS author,
        s.created_at, s.reviewed_at
   FROM wiki_submissions s
   JOIN users u ON u.id = s.author_id
   LEFT JOIN wiki_entries w ON w.id = s.entry_id";

impl SubmissionRow {
    fn brief(&self) -> SubmissionBrief {
        SubmissionBrief {
            id: self.id.clone(),
            entry_id: self.entry_id.clone(),
            entry_slug: self.entry_slug.clone(),
            title: self.title.clone(),
            summary: self.summary.clone(),
            category: self.category.clone(),
            status: self.status.clone(),
            note: self.note.clone(),
            author: self.author.clone(),
            author_id: self.author_id.clone(),
            created_at: self.created_at.timestamp_millis(),
            reviewed_at: self.reviewed_at.map(|t| t.timestamp_millis()),
        }
    }

    fn detail(self) -> Submission {
        let brief = self.brief();
        Submission {
            brief,
            body: self.body,
            tags: tags_of(&self.tags),
        }
    }
}

pub struct NewSubmission<'a> {
    pub entry_id: Option<&'a str>,
    pub title: &'a str,
    pub summary: &'a str,
    pub body: &'a str,
    pub category: &'a str,
    pub tags: Vec<String>,
    pub author_id: &'a str,
}

/// 同一个人最多挂 3 条待审，防止有人把队列刷满
pub async fn pending_of(pool: &PgPool, author_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT count(*) FROM wiki_submissions WHERE author_id = $1 AND status = 'pending'",
    )
    .bind(author_id)
    .fetch_one(pool)
    .await
}

pub async fn create_submission(
    pool: &PgPool,
    input: &NewSubmission<'_>,
) -> Result<Option<Submission>, sqlx::Error> {
    let id = crate::ids::next('s');
    let tags = Value::Array(input.tags.iter().map(|t| Value::String(t.clone())).collect());

    let inserted = sqlx::query(
        "INSERT INTO wiki_submissions
             (id, entry_id, title, summary, body, category, tags, author_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         ON CONFLICT DO NOTHING",
    )
    .bind(&id)
    .bind(input.entry_id)
    .bind(input.title.trim())
    .bind(input.summary.trim())
    .bind(input.body)
    .bind(input.category)
    .bind(&tags)
    .bind(input.author_id)
    .execute(pool)
    .await?;

    if inserted.rows_affected() == 0 {
        return Ok(None);
    }

    submission(pool, &id).await
}

pub async fn submission(pool: &PgPool, id: &str) -> Result<Option<Submission>, sqlx::Error> {
    let row: Option<SubmissionRow> = sqlx::query_as(&format!("{SUB_SQL} WHERE s.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(SubmissionRow::detail))
}

/// 我的投稿（新的在前）
pub async fn submissions_of(
    pool: &PgPool,
    author_id: &str,
) -> Result<Vec<SubmissionBrief>, sqlx::Error> {
    let rows: Vec<SubmissionRow> = sqlx::query_as(&format!(
        "{SUB_SQL} WHERE s.author_id = $1 ORDER BY s.created_at DESC LIMIT 100"
    ))
    .bind(author_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(SubmissionRow::brief).collect())
}

/// 后台队列：待审默认在前
pub async fn submission_queue(
    pool: &PgPool,
    status: Option<&str>,
) -> Result<Vec<SubmissionBrief>, sqlx::Error> {
    let filter = status.filter(|s| ["pending", "approved", "rejected"].contains(s));
    let rows: Vec<SubmissionRow> = match filter {
        Some(s) => {
            sqlx::query_as(&format!(
                "{SUB_SQL} WHERE s.status = $1 ORDER BY s.created_at DESC LIMIT 200"
            ))
            .bind(s)
            .fetch_all(pool)
            .await?
        }
        None => {
            sqlx::query_as(&format!(
                "{SUB_SQL}
                  ORDER BY (s.status = 'pending') DESC, s.created_at DESC
                  LIMIT 200"
            ))
            .fetch_all(pool)
            .await?
        }
    };
    Ok(rows.iter().map(SubmissionRow::brief).collect())
}

/// 审核：通过则写入词条（新词条 create / 修改走 update），拒绝只标记。
/// 只有 pending 会被处理，重复点不会覆盖已审结果。
pub async fn review(
    pool: &PgPool,
    id: &str,
    status: &str,
    note: &str,
    reviewer_id: &str,
) -> Result<Option<Submission>, sqlx::Error> {
    let current: Option<(String, Option<String>, String, String, String, String, Value)> =
        sqlx::query_as(
            "SELECT id, entry_id, title, summary, body, category, tags
               FROM wiki_submissions WHERE id = $1 AND status = 'pending'",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

    let Some((_, entry_id, title, summary, body, category, tags)) = current else {
        return Ok(None);
    };
    let tag_list: Vec<String> = tags
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default();

    if status == "approved" {
        match entry_id.as_deref() {
            // 修改已有词条：复用 update（它会先写一条历史版本）
            Some(entry) => {
                let patch = PatchEntry {
                    title: Some(&title),
                    summary: Some(&summary),
                    body: Some(&body),
                    category: Some(&category),
                    tags: Some(tag_list.clone()),
                    published: Some(true),
                };
                let author: Option<String> =
                    sqlx::query_scalar("SELECT author_id FROM wiki_submissions WHERE id = $1")
                        .bind(id)
                        .fetch_optional(pool)
                        .await?;
                let editor = author.unwrap_or_else(|| reviewer_id.to_string());
                if update(pool, entry, &patch, &editor).await?.is_none() {
                    return Ok(None);
                }
            }
            // 新词条：直接建，作者记为提交者
            None => {
                let author: Option<String> =
                    sqlx::query_scalar("SELECT author_id FROM wiki_submissions WHERE id = $1")
                        .bind(id)
                        .fetch_optional(pool)
                        .await?;
                let author = author.unwrap_or_else(|| reviewer_id.to_string());
                let created = create(
                    pool,
                    &NewEntry {
                        title: &title,
                        slug: "",
                        summary: &summary,
                        body: &body,
                        category: &category,
                        tags: tag_list.clone(),
                        published: true,
                        author_id: &author,
                    },
                )
                .await?;
                if created.is_none() {
                    return Ok(None);
                }
            }
        }
    }

    sqlx::query(
        "UPDATE wiki_submissions
            SET status = $2, note = $3, reviewer_id = $4, reviewed_at = now(), updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(note.trim())
    .bind(reviewer_id)
    .execute(pool)
    .await?;

    submission(pool, id).await
}

/// 后台徽章：待审数量
pub async fn pending_total(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*) FROM wiki_submissions WHERE status = 'pending'")
        .fetch_one(pool)
        .await
}
