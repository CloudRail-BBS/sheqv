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
    /// 作者的认证标记：blue / red，未认证不返回
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_verify: Option<String>,
    pub body: String,
    /// 楼层号：楼主是 1，第一条评论是 2
    pub floor: i64,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub body: String,
    pub tags: Vec<String>,
    pub likes: i64,
    /// 当前登录用户是否已点赞；未登录恒为 false
    pub liked: bool,
    pub comments: i64,
    /// 浏览数（详情页每次打开 +1）
    pub views: i64,
    /// 作者认证标记：blue / red
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_verify: Option<String>,
    pub pinned: bool,
    pub featured: bool,
    /// 管理员声明；空串不下发
    #[serde(skip_serializing_if = "String::is_empty")]
    pub admin_note: String,
    /// 声明时间（毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub admin_note_at: Option<i64>,
    /// 编辑时间（毫秒）；没编辑过不返回
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<i64>,
    pub comments_list: Vec<CommentView>,
    pub created_at: i64,
    pub is_new: bool,
    pub href: String,
    /// pending / published / rejected；前端据此显示「审核中」等提示
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reject_reason: Option<String>,
    /// 审核时间（通过或驳回）；未审时不下发
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<i64>,
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
    views: i64,
    pinned: bool,
    featured: bool,
    admin_note: String,
    admin_note_at: Option<DateTime<Utc>>,
    edited_at: Option<DateTime<Utc>>,
    verify_kind: String,
    status: String,
    reject_reason: Option<String>,
    reviewed_at: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct CommentRow {
    id: String,
    post_id: String,
    author_id: String,
    author: String,
    verify_kind: String,
    body: String,
    created_at: DateTime<Utc>,
}

const POST_SQL: &str = "SELECT p.id, p.title, p.body, p.guild, p.tags, p.author_id,
        u.nickname AS author, u.verify_kind, p.created_at, p.like_count, p.views,
        p.pinned, p.featured, p.admin_note, p.admin_note_at,
        p.edited_at, p.status, p.reject_reason, p.reviewed_at
   FROM posts p JOIN users u ON u.id = p.author_id";

fn to_view(row: PostRow, comments: Vec<CommentView>) -> PostView {
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
        title: row.title.filter(|t| !t.is_empty()),
        body: row.body,
        tags,
        likes: row.like_count as i64,
        liked: false,
        author_verify: Some(row.verify_kind).filter(|v| !v.is_empty()),
        pinned: row.pinned,
        featured: row.featured,
        admin_note: row.admin_note,
        admin_note_at: row.admin_note_at.map(|t| t.timestamp_millis()),
        edited_at: row.edited_at.map(|t| t.timestamp_millis()),
        comments: comments.len() as i64,
        views: row.views,
        comments_list: comments,
        created_at: row.created_at.timestamp_millis(),
        is_new: true,
        status: row.status,
        reject_reason: row.reject_reason,
        reviewed_at: row.reviewed_at.map(|t| t.timestamp_millis()),
    }
}

/// 管理员声明：传空串表示取消。返回更新后的帖子。
pub async fn set_notice(
    pool: &PgPool,
    post_id: &str,
    note: &str,
) -> Result<Option<PostView>, sqlx::Error> {
    let clean = note.trim();
    let updated = sqlx::query_as::<_, PostRow>(&format!(
        "UPDATE posts SET admin_note = $2,
                admin_note_at = CASE WHEN $2 = '' THEN NULL ELSE now() END
          WHERE id = $1
         RETURNING id, title, body, guild, tags, author_id,
                   (SELECT nickname FROM users WHERE id = author_id) AS author,
                   (SELECT verify_kind FROM users WHERE id = author_id) AS verify_kind,
                   created_at, like_count, views, pinned, featured,
                   admin_note, admin_note_at, edited_at, status, reject_reason, reviewed_at"
    ))
    .bind(post_id)
    .bind(clean)
    .fetch_optional(pool)
    .await?;
    Ok(updated.map(|r| to_view(r, Vec::new())))
}

/// 列表：新的在前。`q` 为空表示不筛选。
///
/// 搜索走 `ILIKE`（配合 `pg_trgm` 索引），中文按子串命中；
/// 用户输入里的 `%` `_` `\` 会被转义，避免把通配符当语法用。
pub async fn list(
    pool: &PgPool,
    q: Option<&str>,
    tab: &str,
    viewer: Option<&str>,
) -> Result<Vec<PostView>, sqlx::Error> {
    let keyword = q.map(str::trim).filter(|v| !v.is_empty());
    let tab = match tab {
        "new" | "following" | "joined" | "recommend" => tab,
        _ => "recommend",
    };

    let mut sql = format!("{POST_SQL} WHERE p.status = 'published'");
    let mut binds: Vec<String> = Vec::new();

    if let Some(word) = keyword {
        binds.push(format!("%{}%", escape_like(word)));
        let i = binds.len();
        sql.push_str(&format!(
            " AND (p.title ILIKE ${i} ESCAPE '\\'
                OR p.body ILIKE ${i} ESCAPE '\\'
                OR p.tags::text ILIKE ${i} ESCAPE '\\')"
        ));
    }

    if tab == "following" || tab == "joined" {
        // 未登录时这两个 tab 没有意义，直接返回空列表
        let Some(me) = viewer else {
            return Ok(Vec::new());
        };
        binds.push(me.to_string());
        let i = binds.len();
        if tab == "following" {
            sql.push_str(&format!(
                " AND p.author_id IN (SELECT followee_id FROM user_follows WHERE follower_id = ${i})"
            ));
        } else {
            sql.push_str(&format!(
                " AND (EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ${i})
                    OR EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id = ${i}))"
            ));
        }
    }

    sql.push_str(match tab {
        // 最新：纯时间序，置顶也不插队
        "new" => " ORDER BY p.created_at DESC, p.id DESC",
        // 推荐：置顶 → 精华 → 互动加权（赞 ×3 + 评论 ×2 + 浏览 /50）→ 时间
        "recommend" => {
            " ORDER BY p.pinned DESC, p.featured DESC,
                (p.like_count * 3
                 + (SELECT count(*) FROM comments c2 WHERE c2.post_id = p.id) * 2
                 + p.views / 50) DESC,
                p.created_at DESC"
        }
        // 关注 / 我参与的：仍然置顶优先，其余按时间
        _ => " ORDER BY p.pinned DESC, p.featured DESC, p.created_at DESC",
    });

    let mut query = sqlx::query_as::<_, PostRow>(&sql);
    for value in &binds {
        query = query.bind(value);
    }
    let rows: Vec<PostRow> = query.fetch_all(pool).await?;

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    // 只捞本次结果集的评论，避免全表扫描后大部分被丢掉
    let ids: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    let comments: Vec<CommentRow> = sqlx::query_as(
        "SELECT c.id, c.post_id, c.author_id, u.nickname AS author, u.verify_kind, c.body, c.created_at
           FROM comments c JOIN users u ON u.id = c.author_id
          WHERE c.post_id = ANY($1)
          ORDER BY c.created_at ASC",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let mut grouped: std::collections::HashMap<String, Vec<CommentView>> =
        std::collections::HashMap::new();
    for c in comments {
        let list = grouped.entry(c.post_id).or_default();
        let floor = list.len() as i64 + 2;
        list.push(CommentView {
            id: c.id,
            author: c.author,
            author_id: Some(c.author_id),
            author_verify: Some(c.verify_kind).filter(|v| !v.is_empty()),
            body: c.body,
            floor,
            at: c.created_at.timestamp_millis(),
        });
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let list = grouped.remove(&row.id).unwrap_or_default();
            to_view(row, list)
        })
        .collect())
}

/// 转义 LIKE 通配符，让用户搜「100%」不会被当成 `%100%%`
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

/// 作者（或管理员）二次编辑：只改标题与正文，状态不变，记 `edited_at`。
pub async fn edit(
    pool: &PgPool,
    id: &str,
    title: Option<&str>,
    body: &str,
) -> Result<Option<PostView>, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE posts SET title = $2, body = $3, edited_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(title)
    .bind(body)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Ok(None);
    }
    get(pool, id).await
}

/// 置顶 / 精华（后台）。传 None 表示这一项不动。
pub async fn set_flags(
    pool: &PgPool,
    id: &str,
    pinned: Option<bool>,
    featured: Option<bool>,
) -> Result<Option<PostView>, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE posts SET pinned = COALESCE($2, pinned),
                          featured = COALESCE($3, featured)
          WHERE id = $1",
    )
    .bind(id)
    .bind(pinned)
    .bind(featured)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Ok(None);
    }
    get(pool, id).await
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<PostView>, sqlx::Error> {
    let row: Option<PostRow> = sqlx::query_as(&format!("{POST_SQL} WHERE p.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;

    let Some(mut row) = row else { return Ok(None) };

    // 浏览数：只有已发布的帖子才累计，作者的编辑页 / 后台预览不算
    if row.status == "published" {
        let _ = sqlx::query("UPDATE posts SET views = views + 1 WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await;
        row.views += 1;
    }

    let comments: Vec<CommentRow> = sqlx::query_as(
        "SELECT c.id, c.post_id, c.author_id, u.nickname AS author, u.verify_kind, c.body, c.created_at
           FROM comments c JOIN users u ON u.id = c.author_id
          WHERE c.post_id = $1 ORDER BY c.created_at ASC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    // 楼层号按时间正序排：楼主占 1 楼，第一条评论从 2 楼开始
    let comment_views = comments
        .into_iter()
        .enumerate()
        .map(|(i, c)| CommentView {
            id: c.id,
            author: c.author,
            author_id: Some(c.author_id),
            author_verify: Some(c.verify_kind).filter(|v| !v.is_empty()),
            body: c.body,
            floor: i as i64 + 2,
            at: c.created_at.timestamp_millis(),
        })
        .collect();

    Ok(Some(to_view(row, comment_views)))
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
    /// pending / published：由审核策略在写库前决定
    pub status: &'a str,
}

pub async fn add(pool: &PgPool, user_id: &str, input: NewPost<'_>) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('p');
    let tags = Value::Array(input.tags.into_iter().take(3).map(Value::String).collect());

    sqlx::query(
        "INSERT INTO posts (id, title, body, guild, tags, author_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())",
    )
    .bind(&id)
    .bind(input.title)
    .bind(input.body)
    // 公会名暂时留空：没有公会体系的真实归属前，别写「个人」这种占位值
    .bind("")
    .bind(tags)
    .bind(user_id)
    .bind(input.status)
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

    // 先数已有评论：第一条评论是 2 楼
    let existing: i64 = sqlx::query_scalar("SELECT count(*) FROM comments WHERE post_id = $1")
        .bind(post_id)
        .fetch_one(pool)
        .await?;

    let id = crate::ids::next('c');
    let (created_at, author, verify_kind): (DateTime<Utc>, String, String) = sqlx::query_as(
        "WITH ins AS (
             INSERT INTO comments (id, post_id, author_id, body, created_at)
             VALUES ($1, $2, $3, $4, now()) RETURNING created_at
         )
         SELECT ins.created_at, u.nickname, u.verify_kind FROM ins, users u WHERE u.id = $3",
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
        author_verify: Some(verify_kind).filter(|v| !v.is_empty()),
        body: body.to_string(),
        floor: existing + 2,
        at: created_at.timestamp_millis(),
    }))
}

/// 点赞：计数器 +1（允许匿名、允许重复），返回累计数
/// 点赞 / 取消点赞：一人一票，重复点只会在「已赞 / 未赞」之间切换。
///
/// 返回 `(总数, 当前是否已赞)`；帖子不存在返回 `None`。
/// `posts.like_count` 是冗余计数，和 `post_likes` 在同一个事务里更新，不会漂。
pub async fn toggle_like(
    pool: &PgPool,
    post_id: &str,
    user_id: &str,
) -> Result<Option<(i64, bool)>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM posts WHERE id = $1")
        .bind(post_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Ok(None);
    }

    let removed = sqlx::query("DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2")
        .bind(post_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    let liked = removed.rows_affected() == 0;
    if liked {
        // 并发双击时第二条会命中主键冲突，忽略即可，结果仍是「已赞」
        sqlx::query(
            "INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)
             ON CONFLICT (post_id, user_id) DO NOTHING",
        )
        .bind(post_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    }

    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM post_likes WHERE post_id = $1")
        .bind(post_id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("UPDATE posts SET like_count = $2 WHERE id = $1")
        .bind(post_id)
        .bind(count as i32)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(Some((count, liked)))
}

/// 给一批帖子标上「当前用户点没点过赞」：一次查询，避免每行一次往返。
pub async fn mark_liked(
    pool: &PgPool,
    user_id: Option<&str>,
    items: &mut [PostView],
) -> Result<(), sqlx::Error> {
    let Some(uid) = user_id else {
        return Ok(());
    };
    if items.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
    let liked: Vec<String> = sqlx::query_scalar(
        "SELECT post_id FROM post_likes WHERE user_id = $1 AND post_id = ANY($2)",
    )
    .bind(uid)
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    for item in items.iter_mut() {
        item.liked = liked.iter().any(|id| id == &item.id);
    }
    Ok(())
}

/// 后台删一条评论（楼层）。评论删除后楼层号会重排，这是预期行为：
/// 楼层是「当前第几楼」，不是永久编号。
///
/// 删楼同时冲正评论积分，否则「评论 +2 → 删评论」又是一个刷分口子。
pub async fn delete_comment(pool: &PgPool, comment_id: &str) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let author: Option<String> =
        sqlx::query_scalar("DELETE FROM comments WHERE id = $1 RETURNING author_id")
            .bind(comment_id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(author) = author else {
        tx.rollback().await?;
        return Ok(false);
    };
    crate::points::revoke_in(
        &mut tx,
        &author,
        crate::points::COMMENT_REWARD,
        "comment_revoke",
        Some(comment_id),
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}

/// 删帖。评论会被外键级联删除，所以先把评论作者统计出来，
/// 再连同帖子本身的发帖分一起冲正。
pub async fn delete(pool: &PgPool, post_id: &str) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let comment_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT author_id, count(*)::bigint FROM comments WHERE post_id = $1 GROUP BY author_id",
    )
    .bind(post_id)
    .fetch_all(&mut *tx)
    .await?;

    let author: Option<String> =
        sqlx::query_scalar("DELETE FROM posts WHERE id = $1 RETURNING author_id")
            .bind(post_id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(author) = author else {
        tx.rollback().await?;
        return Ok(false);
    };

    crate::points::revoke_in(
        &mut tx,
        &author,
        crate::points::POST_REWARD,
        "post_revoke",
        Some(post_id),
    )
    .await?;
    for (commenter, count) in comment_rows {
        crate::points::revoke_in(
            &mut tx,
            &commenter,
            count * crate::points::COMMENT_REWARD,
            "comment_revoke",
            Some(post_id),
        )
        .await?;
    }

    tx.commit().await?;
    Ok(true)
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
