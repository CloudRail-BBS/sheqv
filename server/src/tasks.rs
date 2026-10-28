//! 任务系统：后台定义，用户按当期进度领取积分。
//!
//! 进度不落计数器，按当期起点实时数一遍（见迁移 0026 的注释）。
//! 领取用 `(user, task, period_key)` 唯一约束防重复，日常 / 周常不需要定时清表。

use serde::Serialize;
use sqlx::PgPool;

use crate::points;

pub const KINDS: [&str; 3] = ["daily", "weekly", "once"];
pub const METRICS: [&str; 6] = ["checkin", "post", "comment", "like", "resource", "server"];

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskRow {
    pub id: String,
    pub title: String,
    pub description: String,
    pub kind: String,
    pub metric: String,
    pub target: i32,
    pub reward_points: i32,
    pub sort: i32,
    pub enabled: bool,
}

/// 前台视图：任务定义 + 当期进度
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskView {
    pub id: String,
    pub title: String,
    pub description: String,
    pub kind: String,
    pub metric: String,
    pub target: i64,
    pub reward_points: i64,
    pub progress: i64,
    pub claimed: bool,
    pub claimable: bool,
    /// 当期标识：2026-10-28 / 2026-W44 / once
    pub period_key: String,
}

pub enum TaskError {
    NotFound,
    NotReady,
    Claimed,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for TaskError {
    fn from(e: sqlx::Error) -> Self {
        TaskError::Db(e)
    }
}

/// 指标 → (表, 用户列, 时间列)。全部是固定值，不接受用户输入拼接。
fn metric_source(metric: &str) -> Option<(&'static str, &'static str, &'static str)> {
    Some(match metric {
        "checkin" => ("checkins", "user_id", "created_at"),
        "post" => ("posts", "author_id", "created_at"),
        "comment" => ("comments", "author_id", "created_at"),
        "like" => ("likes", "user_id", "at"),
        "resource" => ("resources", "author_id", "created_at"),
        "server" => ("game_servers", "owner_id", "created_at"),
        _ => return None,
    })
}

/// 当期 key 与起点。日 / 周都按上海时区切，和签到保持一致。
fn period(kind: &str) -> (&'static str, &'static str) {
    match kind {
        "daily" => (
            "to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')",
            "date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'",
        ),
        "weekly" => (
            "to_char(now() AT TIME ZONE 'Asia/Shanghai', 'IYYY-\"W\"IW')",
            "date_trunc('week', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'",
        ),
        _ => ("'once'", "to_timestamp(0)"),
    }
}

async fn progress(pool: &PgPool, user_id: &str, task: &TaskRow) -> Result<(String, i64), sqlx::Error> {
    let Some((table, user_col, time_col)) = metric_source(&task.metric) else {
        return Ok(("once".into(), 0));
    };
    let (key_expr, start_expr) = period(&task.kind);
    let sql = format!(
        "SELECT {key_expr} AS period_key,
                (SELECT count(*) FROM {table} t
                  WHERE t.{user_col} = $1 AND t.{time_col} >= ({start_expr}))::bigint AS progress"
    );
    let (key, value): (String, i64) = sqlx::query_as(&sql)
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    Ok((key, value))
}

async fn claimed(pool: &PgPool, user_id: &str, task_id: &str, key: &str) -> Result<bool, sqlx::Error> {
    let done: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM task_claims WHERE user_id = $1 AND task_id = $2 AND period_key = $3)",
    )
    .bind(user_id)
    .bind(task_id)
    .bind(key)
    .fetch_one(pool)
    .await?;
    Ok(done)
}

pub async fn list(pool: &PgPool, user_id: &str) -> Result<Vec<TaskView>, sqlx::Error> {
    let rows: Vec<TaskRow> = sqlx::query_as(
        "SELECT id, title, description, kind, metric, target, reward_points, sort, enabled
           FROM tasks WHERE enabled ORDER BY sort, created_at",
    )
    .fetch_all(pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let (key, done_count) = progress(pool, user_id, &row).await?;
        let already = claimed(pool, user_id, &row.id, &key).await?;
        let target = row.target as i64;
        out.push(TaskView {
            id: row.id,
            title: row.title,
            description: row.description,
            kind: row.kind,
            metric: row.metric,
            target,
            reward_points: row.reward_points as i64,
            progress: done_count.min(target),
            claimed: already,
            claimable: !already && done_count >= target,
            period_key: key,
        });
    }
    Ok(out)
}

/// 领取：返回最新积分余额
pub async fn claim(pool: &PgPool, user_id: &str, task_id: &str) -> Result<i64, TaskError> {
    let row: Option<TaskRow> = sqlx::query_as(
        "SELECT id, title, description, kind, metric, target, reward_points, sort, enabled
           FROM tasks WHERE id = $1 AND enabled",
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else { return Err(TaskError::NotFound) };

    let (key, done_count) = progress(pool, user_id, &row).await?;
    if done_count < row.target as i64 {
        return Err(TaskError::NotReady);
    }

    let inserted = sqlx::query(
        "INSERT INTO task_claims (user_id, task_id, period_key) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .bind(&row.id)
    .bind(&key)
    .execute(pool)
    .await?;
    if inserted.rows_affected() == 0 {
        return Err(TaskError::Claimed);
    }

    // 0 分任务也要留领取记录（比如纯展示型任务），此时不写流水
    if row.reward_points <= 0 {
        let balance: i64 =
            sqlx::query_scalar("SELECT points::bigint FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_one(pool)
                .await?;
        return Ok(balance);
    }

    let balance = points::award(
        pool,
        user_id,
        row.reward_points as i64,
        "task",
        Some(&row.id),
    )
    .await
    .map_err(TaskError::Db)?;
    Ok(balance)
}

/* ── 后台 ───────────────────────────────── */

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<TaskRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, title, description, kind, metric, target, reward_points, sort, enabled
           FROM tasks WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn admin_list(pool: &PgPool) -> Result<Vec<TaskRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, title, description, kind, metric, target, reward_points, sort, enabled
           FROM tasks ORDER BY sort, created_at",
    )
    .fetch_all(pool)
    .await
}

pub struct TaskInput<'a> {
    pub title: &'a str,
    pub description: &'a str,
    pub kind: &'a str,
    pub metric: &'a str,
    pub target: i64,
    pub reward_points: i64,
    pub sort: i64,
    pub enabled: bool,
}

pub fn validate(input: &TaskInput<'_>) -> Option<String> {
    let title_len = input.title.trim().chars().count();
    if !(2..=30).contains(&title_len) {
        return Some("任务标题需 2–30 字".into());
    }
    if input.description.trim().chars().count() > 200 {
        return Some("任务说明不能超过 200 字".into());
    }
    if !KINDS.contains(&input.kind) {
        return Some("周期只能是 daily / weekly / once".into());
    }
    if !METRICS.contains(&input.metric) {
        return Some("统计指标不合法".into());
    }
    if !(1..=1000).contains(&input.target) {
        return Some("目标次数需在 1–1000 之间".into());
    }
    if !(0..=10000).contains(&input.reward_points) {
        return Some("奖励积分需在 0–10000 之间".into());
    }
    None
}

pub async fn create(pool: &PgPool, input: &TaskInput<'_>) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('k');
    sqlx::query(
        "INSERT INTO tasks (id, title, description, kind, metric, target, reward_points, sort, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&id)
    .bind(input.title.trim())
    .bind(input.description.trim())
    .bind(input.kind)
    .bind(input.metric)
    .bind(input.target as i32)
    .bind(input.reward_points as i32)
    .bind(input.sort as i32)
    .bind(input.enabled)
    .execute(pool)
    .await?;
    Ok(id)
}

pub struct TaskPatch<'a> {
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub kind: Option<&'a str>,
    pub metric: Option<&'a str>,
    pub target: Option<i64>,
    pub reward_points: Option<i64>,
    pub sort: Option<i64>,
    pub enabled: Option<bool>,
}

pub async fn patch(pool: &PgPool, id: &str, patch: &TaskPatch<'_>) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE tasks SET
            title = COALESCE($2, title),
            description = COALESCE($3, description),
            kind = COALESCE($4, kind),
            metric = COALESCE($5, metric),
            target = COALESCE($6, target),
            reward_points = COALESCE($7, reward_points),
            sort = COALESCE($8, sort),
            enabled = COALESCE($9, enabled)
          WHERE id = $1",
    )
    .bind(id)
    .bind(patch.title.map(str::trim))
    .bind(patch.description.map(str::trim))
    .bind(patch.kind)
    .bind(patch.metric)
    .bind(patch.target.map(|v| v as i32))
    .bind(patch.reward_points.map(|v| v as i32))
    .bind(patch.sort.map(|v| v as i32))
    .bind(patch.enabled)
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
