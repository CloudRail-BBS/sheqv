//! 论坛：帖子 / 评论 / 点赞。
//!
//! 与 Node 版的行为契约（不要"优化"掉）：
//! * 点赞是**计数器**语义，允许匿名、允许重复点，每次 +1；
//! * 作者只来自会话，请求体里的 author 一律忽略；
//! * 发帖与评论要求「已登录 + 已签社区公约」，未登录是 **403 `need_login`**（不是 401）。

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentView {
    pub id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_id: Option<String>,
    pub body: String,
    /// 毫秒时间戳
    pub at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostView {
    pub id: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_id: Option<String>,
    pub guild: String,
    /// 相对时间（与 Node 版同文案），前端直接渲染
    pub time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub body: String,
    pub tags: Vec<String>,
    pub likes: i64,
    pub comments: i64,
    pub comments_list: Vec<CommentView>,
    pub created_at: i64,
    pub is_new: bool,
    pub href: String,
}

#[derive(sqlx::FromRow)]
struct PostRow {
    id: String,
    title: Option<String>,
    body: String,
    guild: String,
    tags: Value,
    author_id: String,
    author: String,
    created_at: DateTime<Utc>,
    like_count: i32,
}

#[derive(sqlx::FromRow)]
struct CommentRow {
    id: String,
    post_id: String,
    author_id: String,
    author: String,
    body: String,
    created_at: DateTime<Utc>,
}

pub fn rel_time(created: DateTime<Utc>, now: DateTime<Utc>) -> String {
    let minutes = (now - created).num_minutes().max(0);
    if minutes < 1 {
        return "刚刚".to_string();
    }
    if minutes < 60 {
        return format!("{minutes} 分钟前");
    }
    let hours = minutes / 60;
    if hours < 24 {
        return format!("{hours} 小时前");
    }
    format!("{} 天前", hours / 24)
}

const POST_SQL: &str = "SELECT p.id, p.title, p.body, p.guild, p.tags, p.author_id,
        u.nickname AS author, p.created_at, p.like_count
   FROM posts p JOIN users u ON u.id = p.author_id";

fn to_view(row: PostRow, comments: Vec<CommentView>, now: DateTime<Utc>) -> PostView {
    let tags = row
        .tags
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    PostView {
        href: format!("/p/{}", row.id),
        id: row.id,
        author: row.author,
        author_id: Some(row.author_id),
        guild: row.guild,
        time: rel_time(row.created_at, now),
        title: row.title.filter(|t| !t.is_empty()),
        body: row.body,
        tags,
        likes: row.like_count as i64,
        comments: comments.len() as i64,
        comments_list: comments,
        created_at: row.created_at.timestamp_millis(),
        is_new: true,
    }
}

/// 列表：新的在前。评论一次查完再按 postId 分组，避免 N+1。
pub async fn list(pool: &PgPool) -> Result<Vec<PostView>, sqlx::Error> {
    let now = Utc::now();
    let rows: Vec<PostRow> = sqlx::query_as(&format!("{POST_SQL} ORDER BY p.created_at DESC"))
        .fetch_all(pool)
        .await?;

    let comments: Vec<CommentRow> = sqlx::query_as(
        "SELECT c.id, c.post_id, c.author_id, u.nickname AS author, c.body, c.created_at
           FROM comments c JOIN users u ON u.id = c.author_id
          ORDER BY c.created_at ASC",
    )
    .fetch_all(pool)
    .await?;

    let mut grouped: std::collections::HashMap<String, Vec<CommentView>> =
        std::collections::HashMap::new();
    for c in comments {
        grouped.entry(c.post_id).or_default().push(CommentView {
            id: c.id,
            author: c.author,
            author_id: Some(c.author_id),
            body: c.body,
            at: c.created_at.timestamp_millis(),
        });
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let list = grouped.remove(&row.id).unwrap_or_default();
            to_view(row, list, now)
        })
        .collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<PostView>, sqlx::Error> {
    let row: Option<PostRow> = sqlx::query_as(&format!("{POST_SQL} WHERE p.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;

    let Some(row) = row else { return Ok(None) };

    let comments: Vec<CommentRow> = sqlx::query_as(
        "SELECT c.id, c.post_id, c.author_id, u.nickname AS author, c.body, c.created_at
           FROM comments c JOIN users u ON u.id = c.author_id
          WHERE c.post_id = $1 ORDER BY c.created_at ASC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let views = comments
        .into_iter()
        .map(|c| CommentView {
            id: c.id,
            author: c.author,
            author_id: Some(c.author_id),
            body: c.body,
            at: c.created_at.timestamp_millis(),
        })
        .collect();

    Ok(Some(to_view(row, views, Utc::now())))
}

pub fn validate_post(title: &str, body: &str) -> Option<&'static str> {
    let title_len = title.chars().count();
    let body_len = body.chars().count();
    if !(4..=60).contains(&title_len) {
        return Some("标题需 4–60 字");
    }
    if body_len < 10 {
        return Some("正文至少 10 字");
    }
    if body_len > 8000 {
        return Some("正文不超过 8000 字");
    }
    None
}

pub struct NewPost<'a> {
    pub title: &'a str,
    pub body: &'a str,
    pub tags: Vec<String>,
}

pub async fn add(pool: &PgPool, user_id: &str, input: NewPost<'_>) -> Result<String, sqlx::Error> {
    let id = short_id('p');
    let tags = Value::Array(input.tags.into_iter().take(3).map(Value::String).collect());

    sqlx::query(
        "INSERT INTO posts (id, title, body, guild, tags, author_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())",
    )
    .bind(&id)
    .bind(input.title)
    .bind(input.body)
    .bind("个人")
    .bind(tags)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn add_comment(
    pool: &PgPool,
    post_id: &str,
    user_id: &str,
    body: &str,
) -> Result<Option<CommentView>, sqlx::Error> {
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM posts WHERE id = $1")
        .bind(post_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Ok(None);
    }

    let id = short_id('c');
    let (created_at, author): (DateTime<Utc>, String) = sqlx::query_as(
        "WITH ins AS (
             INSERT INTO comments (id, post_id, author_id, body, created_at)
             VALUES ($1, $2, $3, $4, now()) RETURNING created_at
         )
         SELECT ins.created_at, u.nickname FROM ins, users u WHERE u.id = $3",
    )
    .bind(&id)
    .bind(post_id)
    .bind(user_id)
    .bind(body)
    .fetch_one(pool)
    .await?;

    Ok(Some(CommentView {
        id,
        author,
        author_id: Some(user_id.to_string()),
        body: body.to_string(),
        at: created_at.timestamp_millis(),
    }))
}

/// 点赞：计数器 +1（允许匿名、允许重复），返回累计数
pub async fn like(pool: &PgPool, post_id: &str) -> Result<Option<i64>, sqlx::Error> {
    let likes: Option<i32> = sqlx::query_scalar(
        "UPDATE posts SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count",
    )
    .bind(post_id)
    .fetch_optional(pool)
    .await?;
    Ok(likes.map(|v| v as i64))
}

pub async fn delete(pool: &PgPool, post_id: &str) -> Result<bool, sqlx::Error> {
    let affected = sqlx::query("DELETE FROM posts WHERE id = $1")
        .bind(post_id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(affected > 0)
}

pub async fn stats(pool: &PgPool) -> Result<(i64, i64, i64), sqlx::Error> {
    let posts: i64 = sqlx::query_scalar("SELECT count(*) FROM posts")
        .fetch_one(pool)
        .await?;
    let comments: i64 = sqlx::query_scalar("SELECT count(*) FROM comments")
        .fetch_one(pool)
        .await?;
    let likes: i64 = sqlx::query_scalar("SELECT COALESCE(sum(like_count), 0)::bigint FROM posts")
        .fetch_one(pool)
        .await?;
    Ok((posts, comments, likes))
}

/// `p` / `c` + base36 毫秒（与 Node 版同构）
fn short_id(prefix: char) -> String {
    const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut n = Utc::now().timestamp_millis().max(0) as u64;
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(ALPHABET[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    let mut out = String::with_capacity(buf.len() + 1);
    out.push(prefix);
    for b in buf {
        out.push(b as char);
    }
    out
}
