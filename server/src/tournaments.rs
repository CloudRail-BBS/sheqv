//! 赛事：官方活动的报名与赛程。
//!
//! 与约战（`matches`）分开：这里是「官方组织、统一报名」的活动，
//! 不做名单快照与仲裁。报名先 pending，后台通过后才算占名额。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

pub const GAMES: [&str; 2] = ["minecraft", "rusted_warfare"];
pub const STATUSES: [&str; 4] = ["draft", "signup", "running", "ended"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentView {
    pub id: String,
    pub title: String,
    pub game: String,
    pub mode: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub cover: String,
    pub prize: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signup_start: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signup_end: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_at: Option<i64>,
    pub max_entries: i64,
    pub entry_count: i64,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct TournamentRow {
    id: String,
    title: String,
    game: String,
    mode: String,
    summary: String,
    body: String,
    cover: String,
    prize: String,
    status: String,
    signup_start: Option<DateTime<Utc>>,
    signup_end: Option<DateTime<Utc>>,
    start_at: Option<DateTime<Utc>>,
    end_at: Option<DateTime<Utc>>,
    max_entries: i32,
    entry_count: i64,
    created_at: DateTime<Utc>,
}

impl TournamentRow {
    fn into_view(self, with_body: bool) -> TournamentView {
        TournamentView {
            id: self.id,
            title: self.title,
            game: self.game,
            mode: self.mode,
            summary: self.summary,
            body: with_body.then_some(self.body).filter(|b| !b.trim().is_empty()),
            cover: self.cover,
            prize: self.prize,
            status: self.status,
            signup_start: self.signup_start.map(|t| t.timestamp_millis()),
            signup_end: self.signup_end.map(|t| t.timestamp_millis()),
            start_at: self.start_at.map(|t| t.timestamp_millis()),
            end_at: self.end_at.map(|t| t.timestamp_millis()),
            max_entries: self.max_entries as i64,
            entry_count: self.entry_count,
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryView {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub team_name: String,
    pub contact: String,
    pub note: String,
    pub status: String,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct EntryRow {
    id: String,
    user_id: String,
    nickname: String,
    team_name: String,
    contact: String,
    note: String,
    status: String,
    created_at: DateTime<Utc>,
}

impl EntryRow {
    fn into_view(self) -> EntryView {
        EntryView {
            id: self.id,
            user_id: self.user_id,
            nickname: self.nickname,
            team_name: self.team_name,
            contact: self.contact,
            note: self.note,
            status: self.status,
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

const COLS: &str = "t.id, t.title, t.game, t.mode, t.summary, t.body, t.cover, t.prize,
        t.status, t.signup_start, t.signup_end, t.start_at, t.end_at,
        t.max_entries, t.created_at,
        (SELECT count(*) FROM tournament_entries e
          WHERE e.tournament_id = t.id AND e.status = 'approved')::bigint AS entry_count";

pub enum TournamentError {
    NotFound,
    Already,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for TournamentError {
    fn from(e: sqlx::Error) -> Self {
        TournamentError::Db(e)
    }
}

pub async fn list(pool: &PgPool, include_draft: bool) -> Result<Vec<TournamentView>, sqlx::Error> {
    let rows: Vec<TournamentRow> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM tournaments t
          WHERE ($1 OR t.status <> 'draft')
          ORDER BY (t.status = 'signup') DESC, (t.status = 'running') DESC,
                   t.start_at NULLS LAST, t.created_at DESC"
    ))
    .bind(include_draft)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_view(false)).collect())
}

/// 后台列表：含草稿，带正文（编辑时要回填）
pub async fn admin_list(pool: &PgPool) -> Result<Vec<TournamentView>, sqlx::Error> {
    let rows: Vec<TournamentRow> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM tournaments t
          ORDER BY (t.status = 'signup') DESC, t.created_at DESC"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_view(true)).collect())
}

pub struct Detail {
    pub tournament: TournamentView,
    pub entries: Vec<EntryView>,
    pub my_entry: Option<EntryView>,
}

pub async fn detail(pool: &PgPool, id: &str, viewer: &str) -> Result<Option<Detail>, sqlx::Error> {
    let row: Option<TournamentRow> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM tournaments t WHERE t.id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else { return Ok(None) };

    let entries: Vec<EntryRow> = sqlx::query_as(
        "SELECT e.id, e.user_id, u.nickname, e.team_name, e.contact, e.note, e.status, e.created_at
           FROM tournament_entries e JOIN users u ON u.id = e.user_id
          WHERE e.tournament_id = $1 AND e.status = 'approved'
          ORDER BY e.created_at",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let my_entry: Option<EntryRow> = if viewer.is_empty() {
        None
    } else {
        sqlx::query_as(
            "SELECT e.id, e.user_id, u.nickname, e.team_name, e.contact, e.note, e.status, e.created_at
               FROM tournament_entries e JOIN users u ON u.id = e.user_id
              WHERE e.tournament_id = $1 AND e.user_id = $2",
        )
        .bind(id)
        .bind(viewer)
        .fetch_optional(pool)
        .await?
    };

    Ok(Some(Detail {
        entries: entries.into_iter().map(EntryRow::into_view).collect(),
        my_entry: my_entry.map(EntryRow::into_view),
        tournament: row.into_view(true),
    }))
}

pub struct SignupInput<'a> {
    pub team_name: &'a str,
    pub contact: &'a str,
    pub note: &'a str,
}

pub fn validate_signup(input: &SignupInput<'_>) -> Option<String> {
    let name_len = input.team_name.trim().chars().count();
    if !(2..=24).contains(&name_len) {
        return Some("队名需 2–24 字".into());
    }
    if input.contact.trim().chars().count() > 80 {
        return Some("联系方式不能超过 80 字".into());
    }
    if input.note.trim().chars().count() > 200 {
        return Some("备注不能超过 200 字".into());
    }
    None
}

pub async fn signup(
    pool: &PgPool,
    tournament_id: &str,
    user_id: &str,
    input: &SignupInput<'_>,
) -> Result<EntryView, TournamentError> {
    let row: Option<(String, Option<DateTime<Utc>>, Option<DateTime<Utc>>, i32)> = sqlx::query_as(
        "SELECT status, signup_start, signup_end, max_entries FROM tournaments WHERE id = $1",
    )
    .bind(tournament_id)
    .fetch_optional(pool)
    .await?;
    let Some((status, start, end, max)) = row else {
        return Err(TournamentError::NotFound);
    };
    if status != "signup" {
        return Err(TournamentError::Invalid(
            if status == "draft" {
                "赛事还没开放".into()
            } else {
                "报名已经结束".into()
            },
        ));
    }
    let now = Utc::now();
    if start.is_some_and(|t| t > now) {
        return Err(TournamentError::Invalid("报名还没开始".into()));
    }
    if end.is_some_and(|t| t < now) {
        return Err(TournamentError::Invalid("报名已经截止".into()));
    }

    if max > 0 {
        let taken: i64 = sqlx::query_scalar(
            "SELECT count(*)::bigint FROM tournament_entries
              WHERE tournament_id = $1 AND status IN ('pending', 'approved')",
        )
        .bind(tournament_id)
        .fetch_one(pool)
        .await?;
        if taken >= max as i64 {
            return Err(TournamentError::Invalid("名额已满".into()));
        }
    }

    let existing: Option<(String, String)> = sqlx::query_as(
        "SELECT id, status FROM tournament_entries WHERE tournament_id = $1 AND user_id = $2",
    )
    .bind(tournament_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if let Some((id, status)) = existing {
        if status != "rejected" {
            return Err(TournamentError::Already);
        }
        let row: EntryRow = sqlx::query_as(
            "WITH upd AS (
                 UPDATE tournament_entries
                    SET team_name = $2, contact = $3, note = $4, status = 'pending'
                  WHERE id = $1
                 RETURNING *
             )
             SELECT upd.id, upd.user_id, u.nickname, upd.team_name, upd.contact, upd.note,
                    upd.status, upd.created_at
               FROM upd JOIN users u ON u.id = upd.user_id",
        )
        .bind(&id)
        .bind(input.team_name.trim())
        .bind(input.contact.trim())
        .bind(input.note.trim())
        .fetch_one(pool)
        .await?;
        return Ok(row.into_view());
    }

    let row: EntryRow = sqlx::query_as(
        "WITH ins AS (
             INSERT INTO tournament_entries
                 (id, tournament_id, user_id, team_name, contact, note)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *
         )
         SELECT ins.id, ins.user_id, u.nickname, ins.team_name, ins.contact, ins.note,
                ins.status, ins.created_at
           FROM ins JOIN users u ON u.id = ins.user_id",
    )
    .bind(crate::ids::next('q'))
    .bind(tournament_id)
    .bind(user_id)
    .bind(input.team_name.trim())
    .bind(input.contact.trim())
    .bind(input.note.trim())
    .fetch_one(pool)
    .await?;
    Ok(row.into_view())
}

pub async fn cancel(pool: &PgPool, tournament_id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "DELETE FROM tournament_entries WHERE tournament_id = $1 AND user_id = $2",
    )
    .bind(tournament_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

/* ── 后台 ───────────────────────────────── */

pub struct TournamentInput<'a> {
    pub title: &'a str,
    pub game: &'a str,
    pub mode: &'a str,
    pub summary: &'a str,
    pub body: &'a str,
    pub cover: &'a str,
    pub prize: &'a str,
    pub status: &'a str,
    pub signup_start: Option<DateTime<Utc>>,
    pub signup_end: Option<DateTime<Utc>>,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub max_entries: i64,
}

pub fn validate(input: &TournamentInput<'_>) -> Option<String> {
    let len = |s: &str| s.trim().chars().count();
    if !(2..=60).contains(&len(input.title)) {
        return Some("赛事名称需 2–60 字".into());
    }
    if !GAMES.contains(&input.game) {
        return Some("游戏类型不正确".into());
    }
    if !STATUSES.contains(&input.status) {
        return Some("状态不合法".into());
    }
    if len(input.mode) > 24 {
        return Some("赛制不能超过 24 字".into());
    }
    if len(input.summary) > 200 {
        return Some("简介不能超过 200 字".into());
    }
    if len(input.body) > 8000 {
        return Some("正文不能超过 8000 字".into());
    }
    if len(input.prize) > 300 {
        return Some("奖品说明不能超过 300 字".into());
    }
    if input.max_entries < 0 || input.max_entries > 4096 {
        return Some("名额需在 0–4096 之间".into());
    }
    if let (Some(a), Some(b)) = (input.signup_start, input.signup_end) {
        if a > b {
            return Some("报名开始时间不能晚于截止时间".into());
        }
    }
    None
}

pub async fn create(pool: &PgPool, input: &TournamentInput<'_>) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('t');
    sqlx::query(
        "INSERT INTO tournaments
             (id, title, game, mode, summary, body, cover, prize, status,
              signup_start, signup_end, start_at, end_at, max_entries)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    )
    .bind(&id)
    .bind(input.title.trim())
    .bind(input.game)
    .bind(input.mode.trim())
    .bind(input.summary.trim())
    .bind(input.body.trim())
    .bind(input.cover.trim())
    .bind(input.prize.trim())
    .bind(input.status)
    .bind(input.signup_start)
    .bind(input.signup_end)
    .bind(input.start_at)
    .bind(input.end_at)
    .bind(input.max_entries as i32)
    .execute(pool)
    .await?;
    Ok(id)
}

pub struct TournamentPatch<'a> {
    pub title: Option<&'a str>,
    pub game: Option<&'a str>,
    pub mode: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub body: Option<&'a str>,
    pub cover: Option<&'a str>,
    pub prize: Option<&'a str>,
    pub status: Option<&'a str>,
    pub signup_start: Option<Option<DateTime<Utc>>>,
    pub signup_end: Option<Option<DateTime<Utc>>>,
    pub start_at: Option<Option<DateTime<Utc>>>,
    pub end_at: Option<Option<DateTime<Utc>>>,
    pub max_entries: Option<i64>,
}

pub async fn patch(pool: &PgPool, id: &str, p: &TournamentPatch<'_>) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE tournaments SET
            title = COALESCE($2, title),
            game = COALESCE($3, game),
            mode = COALESCE($4, mode),
            summary = COALESCE($5, summary),
            body = COALESCE($6, body),
            cover = COALESCE($7, cover),
            prize = COALESCE($8, prize),
            status = COALESCE($9, status),
            signup_start = CASE WHEN $10 THEN $11 ELSE signup_start END,
            signup_end = CASE WHEN $12 THEN $13 ELSE signup_end END,
            start_at = CASE WHEN $14 THEN $15 ELSE start_at END,
            end_at = CASE WHEN $16 THEN $17 ELSE end_at END,
            max_entries = COALESCE($18, max_entries),
            updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(p.title.map(str::trim))
    .bind(p.game)
    .bind(p.mode.map(str::trim))
    .bind(p.summary.map(str::trim))
    .bind(p.body.map(str::trim))
    .bind(p.cover.map(str::trim))
    .bind(p.prize.map(str::trim))
    .bind(p.status)
    .bind(p.signup_start.is_some())
    .bind(p.signup_start.flatten())
    .bind(p.signup_end.is_some())
    .bind(p.signup_end.flatten())
    .bind(p.start_at.is_some())
    .bind(p.start_at.flatten())
    .bind(p.end_at.is_some())
    .bind(p.end_at.flatten())
    .bind(p.max_entries.map(|v| v as i32))
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM tournaments WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn admin_entries(pool: &PgPool, id: &str) -> Result<Vec<EntryView>, sqlx::Error> {
    let rows: Vec<EntryRow> = sqlx::query_as(
        "SELECT e.id, e.user_id, u.nickname, e.team_name, e.contact, e.note, e.status, e.created_at
           FROM tournament_entries e JOIN users u ON u.id = e.user_id
          WHERE e.tournament_id = $1
          ORDER BY (e.status = 'pending') DESC, e.created_at",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(EntryRow::into_view).collect())
}

pub async fn review_entry(pool: &PgPool, entry_id: &str, status: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("UPDATE tournament_entries SET status = $2 WHERE id = $1")
        .bind(entry_id)
        .bind(status)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
