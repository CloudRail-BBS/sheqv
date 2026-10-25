//! 约战申请：发起方选自己的公会/战队和对手，对方负责人接受后锁定。
//!
//! 这是确权链路的第一段，结果提交与仲裁仍走后续模块；
//! 先把「发起不了」变成可用的真实记录。

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchView {
    pub id: String,
    pub title: String,
    pub game: String,
    pub format: String,
    pub maps: Vec<String>,
    pub scheduled_at: i64,
    pub note: String,
    pub status: String,
    pub creator_id: String,
    pub creator_kind: String,
    pub creator_org_id: String,
    pub creator_name: String,
    pub creator_tag: String,
    pub opponent_kind: String,
    pub opponent_org_id: String,
    pub opponent_name: String,
    pub opponent_tag: String,
    pub accepted_at: Option<i64>,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    title: String,
    game: String,
    format: String,
    maps: Value,
    scheduled_at: DateTime<Utc>,
    note: String,
    status: String,
    creator_id: String,
    creator_kind: String,
    creator_org_id: String,
    creator_name: String,
    creator_tag: String,
    opponent_kind: String,
    opponent_org_id: String,
    opponent_name: String,
    opponent_tag: String,
    accepted_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

impl Row {
    fn view(self) -> MatchView {
        MatchView {
            id: self.id,
            title: self.title,
            game: self.game,
            format: self.format,
            maps: self
                .maps
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            scheduled_at: self.scheduled_at.timestamp_millis(),
            note: self.note,
            status: self.status,
            creator_id: self.creator_id,
            creator_kind: self.creator_kind,
            creator_org_id: self.creator_org_id,
            creator_name: self.creator_name,
            creator_tag: self.creator_tag,
            opponent_kind: self.opponent_kind,
            opponent_org_id: self.opponent_org_id,
            opponent_name: self.opponent_name,
            opponent_tag: self.opponent_tag,
            accepted_at: self.accepted_at.map(|t| t.timestamp_millis()),
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

const COLS: &str = "id, title, game, format, maps, scheduled_at, note, status,
    creator_id, creator_kind, creator_org_id, creator_name, creator_tag,
    opponent_kind, opponent_org_id, opponent_name, opponent_tag, accepted_at, created_at";

pub async fn list(pool: &PgPool, status: Option<&str>) -> Result<Vec<MatchView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM matches
          WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at DESC LIMIT 100"
    ))
    .bind(status)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::view).collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<MatchView>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("SELECT {COLS} FROM matches WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::view))
}

pub struct NewMatch {
    pub title: String,
    pub game: String,
    pub format: String,
    pub maps: Vec<String>,
    pub scheduled_at: DateTime<Utc>,
    pub note: String,
    pub creator_id: String,
    pub creator_kind: String,
    pub creator_org_id: String,
    pub creator_name: String,
    pub creator_tag: String,
    pub opponent_kind: String,
    pub opponent_org_id: String,
    pub opponent_name: String,
    pub opponent_tag: String,
}

pub async fn create(pool: &PgPool, input: &NewMatch) -> Result<MatchView, sqlx::Error> {
    let id = crate::ids::next('x');
    let maps = Value::Array(input.maps.iter().map(|m| json!(m)).collect());
    sqlx::query(
        "INSERT INTO matches (id, title, game, format, maps, scheduled_at, note, status,
             creator_id, creator_kind, creator_org_id, creator_name, creator_tag,
             opponent_kind, opponent_org_id, opponent_name, opponent_tag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_accept',$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    )
    .bind(&id)
    .bind(&input.title)
    .bind(&input.game)
    .bind(&input.format)
    .bind(maps)
    .bind(input.scheduled_at)
    .bind(&input.note)
    .bind(&input.creator_id)
    .bind(&input.creator_kind)
    .bind(&input.creator_org_id)
    .bind(&input.creator_name)
    .bind(&input.creator_tag)
    .bind(&input.opponent_kind)
    .bind(&input.opponent_org_id)
    .bind(&input.opponent_name)
    .bind(&input.opponent_tag)
    .execute(pool)
    .await?;
    get(pool, &id).await.map(|v| v.expect("刚插入的约战"))
}

pub async fn accept(pool: &PgPool, id: &str, user_id: &str) -> Result<Option<MatchView>, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE matches SET status='locked', accepted_by=$2, accepted_at=now()
          WHERE id=$1 AND status='pending_accept'",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return get(pool, id).await;
    }
    get(pool, id).await
}
