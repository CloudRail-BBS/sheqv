//! 后台待办与「待处理队列」。
//!
//! 两件事放在一起，因为后台首页只有一句话要说清楚：**现在有什么需要我做**。
//! - `admin_todos` 是管理员自己记的事（落库，可勾选、可改期）；
//! - `queues()` 是系统排队出来的事（帖子审核、工单、认证、头衔、服务器、赛事报名），
//!   全部实时 count，不落表 —— 这些数字会随处理进度自己变，存下来反而会漂。

use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

/// 一条待办
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub note: String,
    /// high / normal / low
    pub priority: String,
    /// `YYYY-MM-DD`，没有截止日就是 null
    pub due_date: Option<String>,
    /// open / done
    pub status: String,
    /// 创建人昵称；应急通道创建的是 null
    pub creator: Option<String>,
    pub created_at: i64,
    pub done_at: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    title: String,
    note: String,
    priority: String,
    due_date: Option<NaiveDate>,
    status: String,
    creator: Option<String>,
    created_at: DateTime<Utc>,
    done_at: Option<DateTime<Utc>>,
}

impl Row {
    fn view(self) -> Todo {
        Todo {
            id: self.id,
            title: self.title,
            note: self.note,
            priority: self.priority,
            due_date: self.due_date.map(|d| d.format("%Y-%m-%d").to_string()),
            status: self.status,
            creator: self.creator,
            created_at: self.created_at.timestamp_millis(),
            done_at: self.done_at.map(|d| d.timestamp_millis()),
        }
    }
}

const SQL: &str = "SELECT t.id, t.title, t.note, t.priority, t.due_date, t.status,
        u.nickname AS creator, t.created_at, t.done_at
   FROM admin_todos t LEFT JOIN users u ON u.id = t.created_by";

/// 列表：未完成在前，按「优先级 → 截止日 → 创建时间」排。
/// 已完成的只留最近 30 条，避免时间一长整页都是勾掉的条目。
pub async fn list(pool: &PgPool) -> Result<Vec<Todo>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SQL}
         ORDER BY (t.status = 'done') ASC,
                  CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                  t.due_date ASC NULLS LAST,
                  t.created_at DESC
         LIMIT 200"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::view).collect())
}

pub struct NewTodo<'a> {
    pub title: &'a str,
    pub note: &'a str,
    pub priority: &'a str,
    pub due_date: Option<NaiveDate>,
}

pub async fn create(
    pool: &PgPool,
    new: &NewTodo<'_>,
    created_by: Option<&str>,
) -> Result<Todo, sqlx::Error> {
    let id = ids::next('d');
    sqlx::query(
        "INSERT INTO admin_todos (id, title, note, priority, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&id)
    .bind(new.title)
    .bind(new.note)
    .bind(new.priority)
    .bind(new.due_date)
    .bind(created_by)
    .execute(pool)
    .await?;

    let row: Row = sqlx::query_as(&format!("{SQL} WHERE t.id = $1"))
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(row.view())
}

/// 部分更新。`clear_due = true` 表示把截止日清掉（JSON 里传 `dueDate: null`）。
pub struct PatchTodo<'a> {
    pub title: Option<&'a str>,
    pub note: Option<&'a str>,
    pub priority: Option<&'a str>,
    pub due_date: Option<NaiveDate>,
    pub clear_due: bool,
    pub status: Option<&'a str>,
}

pub async fn patch(
    pool: &PgPool,
    id: &str,
    p: &PatchTodo<'_>,
) -> Result<Option<Todo>, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE admin_todos SET
             title    = COALESCE($2, title),
             note     = COALESCE($3, note),
             priority = COALESCE($4, priority),
             due_date = CASE WHEN $5 THEN $6::date ELSE due_date END,
             status   = COALESCE($7, status),
             -- 勾上时记完成时间；取消勾选清空；其它编辑保持原样
             done_at  = CASE
                          WHEN $7 = 'done' THEN COALESCE(done_at, now())
                          WHEN $7 = 'open' THEN NULL
                          ELSE done_at
                        END
           WHERE id = $1",
    )
    .bind(id)
    .bind(p.title)
    .bind(p.note)
    .bind(p.priority)
    .bind(p.clear_due)
    .bind(p.due_date)
    .bind(p.status)
    .execute(pool)
    .await?;

    if done.rows_affected() == 0 {
        return Ok(None);
    }
    let row: Option<Row> = sqlx::query_as(&format!("{SQL} WHERE t.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::view))
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM admin_todos WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 待办统计：未完成、逾期、今天完成
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoStats {
    pub open: i64,
    pub overdue: i64,
    pub done_today: i64,
    pub done_total: i64,
}

pub async fn stats(pool: &PgPool) -> Result<TodoStats, sqlx::Error> {
    let (open, overdue, done_today, done_total): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
            count(*) FILTER (WHERE status = 'open')::bigint,
            count(*) FILTER (WHERE status = 'open' AND due_date < current_date)::bigint,
            count(*) FILTER (WHERE status = 'done'
                               AND done_at >= date_trunc('day', now()))::bigint,
            count(*) FILTER (WHERE status = 'done')::bigint
           FROM admin_todos",
    )
    .fetch_one(pool)
    .await?;
    Ok(TodoStats {
        open,
        overdue,
        done_today,
        done_total,
    })
}

/// 一条待处理队列（系统排出来的）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Queue {
    pub key: &'static str,
    pub label: &'static str,
    pub href: &'static str,
    pub count: i64,
    /// 队列里最老一条的时间（毫秒），没有就是 null —— 用来提示「积压多久了」
    pub oldest: Option<i64>,
}

/// 六条队列一次性算完：一次往返，避免后台首页串行发六个请求。
pub async fn queues(pool: &PgPool) -> Result<Vec<Queue>, sqlx::Error> {
    let row: (
        i64,
        Option<DateTime<Utc>>,
        i64,
        Option<DateTime<Utc>>,
        i64,
        Option<DateTime<Utc>>,
        i64,
        Option<DateTime<Utc>>,
        i64,
        Option<DateTime<Utc>>,
        i64,
        Option<DateTime<Utc>>,
    ) = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM posts WHERE status = 'pending')::bigint,
            (SELECT min(created_at) FROM posts WHERE status = 'pending'),
            (SELECT count(*) FROM game_servers WHERE status = 'pending')::bigint,
            (SELECT min(created_at) FROM game_servers WHERE status = 'pending'),
            (SELECT count(*) FROM tickets WHERE status = 'open')::bigint,
            (SELECT min(created_at) FROM tickets WHERE status = 'open'),
            (SELECT count(*) FROM verification_requests WHERE status = 'pending')::bigint,
            (SELECT min(created_at) FROM verification_requests WHERE status = 'pending'),
            (SELECT count(*) FROM title_requests WHERE status = 'pending')::bigint,
            (SELECT min(created_at) FROM title_requests WHERE status = 'pending'),
            (SELECT count(*) FROM tournament_entries WHERE status = 'pending')::bigint,
            (SELECT min(created_at) FROM tournament_entries WHERE status = 'pending')",
    )
    .fetch_one(pool)
    .await?;

    let ms = |t: Option<DateTime<Utc>>| t.map(|v| v.timestamp_millis());
    Ok(vec![
        Queue {
            key: "posts",
            label: "待审帖子",
            href: "/admin/audit",
            count: row.0,
            oldest: ms(row.1),
        },
        Queue {
            key: "servers",
            label: "待审服务器",
            href: "/admin/servers",
            count: row.2,
            oldest: ms(row.3),
        },
        Queue {
            key: "tickets",
            label: "待回工单",
            href: "/admin/tickets",
            count: row.4,
            oldest: ms(row.5),
        },
        Queue {
            key: "verifications",
            label: "认证申请",
            href: "/admin/verifications",
            count: row.6,
            oldest: ms(row.7),
        },
        Queue {
            key: "titles",
            label: "头衔申请",
            href: "/admin/titles",
            count: row.8,
            oldest: ms(row.9),
        },
        Queue {
            key: "entries",
            label: "赛事报名",
            href: "/admin/tournaments",
            count: row.10,
            oldest: ms(row.11),
        },
    ])
}
