//! 赞助者快照：`/sponsors` 只读快照，不在渲染时打爱发电接口。
//!
//! 同步的合并语义（改这块务必先看）：
//! * 以爱发电 `user_id` 为主键覆盖金额 / 档位 / 付款时间；
//! * 原有 `hidden` 保留——隐藏是运营决定，不该被下次同步抹掉；
//! * `source='manual'` 的条目原样保留，不参与覆盖也不被删除；
//! * 手动条目只能删，爱发电条目只能隐藏（重同步就会回来）。

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sponsor {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    pub amount: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_pay_at: Option<i64>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub sponsors: Vec<Sponsor>,
    pub synced_at: Option<i64>,
    pub total_amount: f64,
    pub count: usize,
    pub configured: bool,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    name: String,
    avatar: Option<String>,
    amount: f64,
    plan_title: Option<String>,
    first_at: Option<DateTime<Utc>>,
    last_pay_at: Option<DateTime<Utc>>,
    source: String,
    hidden: bool,
}

impl Row {
    fn view(self) -> Sponsor {
        Sponsor {
            id: self.id,
            name: self.name,
            avatar: self.avatar,
            amount: round2(self.amount),
            plan_title: self.plan_title,
            first_at: self.first_at.map(|t| t.timestamp()),
            last_pay_at: self.last_pay_at.map(|t| t.timestamp()),
            source: self.source,
            hidden: self.hidden.then_some(true),
        }
    }
}

const COLS: &str =
    "id, name, avatar, amount::float8 AS amount, plan_title, first_at, last_pay_at, source, hidden";

/// 两位小数 + 归一 `-0.0`：空名单求和会得到负零，序列化出来是 `-0.0`，页面上很难看
fn round2(v: f64) -> f64 {
    let r = (v * 100.0).round() / 100.0;
    if r == 0.0 { 0.0 } else { r }
}

pub async fn snapshot(
    pool: &PgPool,
    include_hidden: bool,
    configured: bool,
) -> Result<Snapshot, sqlx::Error> {
    let sql = if include_hidden {
        format!("SELECT {COLS} FROM sponsors ORDER BY amount DESC, name ASC")
    } else {
        format!("SELECT {COLS} FROM sponsors WHERE NOT hidden ORDER BY amount DESC, name ASC")
    };
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(pool).await?;

    let synced_at: Option<i64> = sqlx::query_scalar(
        "SELECT (value::text)::bigint FROM meta WHERE key = 'sponsors.syncedAt'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let sponsors: Vec<Sponsor> = rows.into_iter().map(Row::view).collect();
    let total = round2(sponsors.iter().map(|s| s.amount).sum::<f64>());

    Ok(Snapshot {
        count: sponsors.len(),
        total_amount: total,
        sponsors,
        synced_at,
        configured,
    })
}

/// 用爱发电返回的列表覆盖快照（保留手动条目与 hidden 标记）
pub async fn replace_from_afdian(
    pool: &PgPool,
    list: &[crate::afdian::Entry],
) -> Result<(usize, f64), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let ids: Vec<String> = list.iter().map(|e| e.id.clone()).collect();

    sqlx::query("DELETE FROM sponsors WHERE source = 'afdian' AND NOT (id = ANY($1))")
        .bind(&ids)
        .execute(&mut *tx)
        .await?;

    for e in list {
        sqlx::query(
            "INSERT INTO sponsors (id, name, avatar, amount, plan_title, first_at, last_pay_at, source)
             VALUES ($1,$2,$3,$4::numeric(12,2),$5,$6,$7,'afdian')
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                avatar = EXCLUDED.avatar,
                amount = EXCLUDED.amount,
                plan_title = EXCLUDED.plan_title,
                first_at = EXCLUDED.first_at,
                last_pay_at = EXCLUDED.last_pay_at,
                source = 'afdian'",
        )
        .bind(&e.id)
        .bind(&e.name)
        .bind(&e.avatar)
        .bind(e.amount)
        .bind(&e.plan_title)
        .bind(e.first_at.and_then(DateTime::from_timestamp_secs))
        .bind(e.last_pay_at.and_then(DateTime::from_timestamp_secs))
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO meta (key, value) VALUES ('sponsors.syncedAt', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(json!(Utc::now().timestamp_millis()))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let total: f64 = sqlx::query_scalar(
        "SELECT COALESCE(sum(amount), 0)::float8 FROM sponsors WHERE source = 'afdian'",
    )
    .fetch_one(pool)
    .await?;

    Ok((list.len(), round2(total)))
}

#[derive(Debug)]
pub enum ManualError {
    InvalidName,
    InvalidAmount,
}

pub async fn add_manual(
    pool: &PgPool,
    name: &str,
    amount: f64,
    plan_title: Option<&str>,
) -> Result<Sponsor, ManualError> {
    let name = name.trim();
    let name_len = name.chars().count();
    if !(1..=24).contains(&name_len) {
        return Err(ManualError::InvalidName);
    }
    if !(amount.is_finite() && amount > 0.0) {
        return Err(ManualError::InvalidAmount);
    }

    let id = crate::ids::next('m');
    let now = Utc::now();

    let row: Row = sqlx::query_as(&format!(
        "INSERT INTO sponsors (id, name, amount, plan_title, first_at, last_pay_at, source)
         VALUES ($1,$2,$3::numeric(12,2),$4,$5,$6,'manual') RETURNING {COLS}"
    ))
    .bind(&id)
    .bind(name)
    .bind(amount)
    .bind(plan_title.map(str::trim).filter(|s| !s.is_empty()))
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|_| ManualError::InvalidAmount)?;

    Ok(row.view())
}

pub async fn set_hidden(pool: &PgPool, id: &str, hidden: bool) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("UPDATE sponsors SET hidden = $2 WHERE id = $1")
        .bind(id)
        .bind(hidden)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}

#[derive(Debug, PartialEq, Eq)]
pub enum RemoveResult {
    Ok,
    NotFound,
    NotManual,
}

pub async fn remove_manual(pool: &PgPool, id: &str) -> Result<RemoveResult, sqlx::Error> {
    let source: Option<String> = sqlx::query_scalar("SELECT source FROM sponsors WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    match source.as_deref() {
        None => Ok(RemoveResult::NotFound),
        Some("manual") => {
            sqlx::query("DELETE FROM sponsors WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            Ok(RemoveResult::Ok)
        }
        Some(_) => Ok(RemoveResult::NotManual),
    }
}

/// 前端展示用：金额去掉多余小数（在 `Value` 之外的地方也能用）
pub fn amount_value(v: f64) -> Value {
    json!((v * 100.0).round() / 100.0)
}
