//! 公会与战队：两个**平行**实体，共用一套仓库逻辑。
//!
//! 设计上有一条不能含糊的边界：**战队独立于公会**。
//! 战队不挂在公会下面，榜单分开算，负责人也是各自的。
//! 所以这里是两张表（`guilds` / `teams`）、两个榜单，只有一个共享的读写实现——
//! `Kind` 决定表名，取值来自常量 match，不拼用户输入。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

pub const GAMES: [&str; 2] = ["minecraft", "rusted_warfare"];
pub const STATUSES: [&str; 3] = ["recruiting", "training", "rest"];

pub const NAME_MIN: usize = 2;
pub const NAME_MAX: usize = 20;
pub const TAG_MIN: usize = 2;
pub const TAG_MAX: usize = 4;
pub const INTRO_MAX: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Guild,
    Team,
}

impl Kind {
    pub fn table(self) -> &'static str {
        match self {
            Kind::Guild => "guilds",
            Kind::Team => "teams",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Guild => "guild",
            Kind::Team => "team",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Kind::Guild => "公会",
            Kind::Team => "战队",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_lowercase().as_str() {
            "guild" | "guilds" => Some(Kind::Guild),
            "team" | "teams" => Some(Kind::Team),
            _ => None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgView {
    pub id: String,
    pub kind: &'static str,
    pub name: String,
    pub tag: String,
    pub game: String,
    pub intro: String,
    /// 负责人昵称；负责人注销后为空
    pub owner: String,
    pub owner_id: Option<String>,
    pub status: String,
    pub points: i64,
    pub wins: i64,
    pub losses: i64,
    pub members: i64,
    /// 胜率（0–1）；没有比赛时是 0，前端据此显示「—」
    pub win_rate: f64,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    name: String,
    tag: String,
    game: String,
    intro: String,
    owner: Option<String>,
    owner_id: Option<String>,
    status: String,
    points: i32,
    wins: i32,
    losses: i32,
    members: i32,
    created_at: DateTime<Utc>,
}

impl Row {
    fn view(self, kind: Kind) -> OrgView {
        let played = self.wins + self.losses;
        OrgView {
            id: self.id,
            kind: kind.as_str(),
            name: self.name,
            tag: self.tag,
            game: self.game,
            intro: self.intro,
            owner: self.owner.unwrap_or_default(),
            owner_id: self.owner_id,
            status: self.status,
            points: self.points as i64,
            wins: self.wins as i64,
            losses: self.losses as i64,
            members: self.members as i64,
            win_rate: if played > 0 {
                self.wins as f64 / played as f64
            } else {
                0.0
            },
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

/// 除了 `kind` 决定表名，其余列名两张表完全一致
fn select(kind: Kind) -> String {
    format!(
        "SELECT o.id, o.name, o.tag, o.game, o.intro, u.nickname AS owner, o.owner_id,
                o.status, o.points, o.wins, o.losses, o.members, o.created_at
           FROM {} o LEFT JOIN users u ON u.id = o.owner_id",
        kind.table()
    )
}

/* ── 校验 ───────────────────────────────── */

#[derive(Debug, Default)]
pub struct OrgInput {
    pub name: String,
    pub tag: String,
    pub game: String,
    pub intro: String,
}

#[derive(Debug, Default)]
pub struct OrgPatch {
    pub name: Option<String>,
    pub tag: Option<String>,
    pub intro: Option<String>,
    pub status: Option<String>,
}

pub fn validate(input: &mut OrgInput) -> Result<(), String> {
    input.name = input.name.trim().to_string();
    input.tag = input.tag.trim().to_uppercase();
    input.game = input.game.trim().to_lowercase();
    input.intro = input.intro.trim().to_string();

    let name_len = input.name.chars().count();
    if !(NAME_MIN..=NAME_MAX).contains(&name_len) {
        return Err(format!("名称需 {NAME_MIN}–{NAME_MAX} 字"));
    }
    let tag_len = input.tag.chars().count();
    if !(TAG_MIN..=TAG_MAX).contains(&tag_len) {
        return Err(format!("简称需 {TAG_MIN}–{TAG_MAX} 字"));
    }
    if input.tag.chars().any(char::is_whitespace) {
        return Err("简称不能带空格".into());
    }
    if !GAMES.contains(&input.game.as_str()) {
        return Err("游戏只能是 minecraft / rusted_warfare".into());
    }
    if input.intro.chars().count() > INTRO_MAX {
        return Err(format!("简介不超过 {INTRO_MAX} 字"));
    }
    Ok(())
}

pub fn validate_status(status: &str) -> Result<(), String> {
    if STATUSES.contains(&status) {
        Ok(())
    } else {
        Err("状态只能是 recruiting / training / rest".into())
    }
}

/* ── 读写 ───────────────────────────────── */

pub enum OrgError {
    NotFound,
    Duplicate(String),
    Invalid(String),
    Db(sqlx::Error),
}

pub async fn list(
    pool: &PgPool,
    kind: Kind,
    game: Option<&str>,
) -> Result<Vec<OrgView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{} WHERE ($1::text IS NULL OR o.game = $1)
          ORDER BY o.points DESC, o.wins DESC, o.losses ASC, o.created_at ASC",
        select(kind)
    ))
    .bind(game)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.view(kind)).collect())
}

pub async fn get(pool: &PgPool, kind: Kind, id: &str) -> Result<Option<OrgView>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("{} WHERE o.id = $1", select(kind)))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.view(kind)))
}

pub async fn create(
    pool: &PgPool,
    kind: Kind,
    owner_id: &str,
    input: &OrgInput,
) -> Result<OrgView, OrgError> {
    let id = crate::ids::next(if kind == Kind::Guild { 'g' } else { 't' });
    let row: Option<Row> = sqlx::query_as(&format!(
        "WITH ins AS (
             INSERT INTO {} (id, name, tag, game, intro, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
         )
         SELECT ins.id, ins.name, ins.tag, ins.game, ins.intro, u.nickname AS owner,
                ins.owner_id, ins.status, ins.points, ins.wins, ins.losses, ins.members,
                ins.created_at
           FROM ins LEFT JOIN users u ON u.id = ins.owner_id",
        kind.table()
    ))
    .bind(&id)
    .bind(&input.name)
    .bind(&input.tag)
    .bind(&input.game)
    .bind(&input.intro)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| map_db_err(e, kind))?;

    row.map(|r| r.view(kind))
        .ok_or_else(|| OrgError::Invalid("创建失败".into()))
}

pub async fn update(
    pool: &PgPool,
    kind: Kind,
    id: &str,
    patch: &OrgPatch,
) -> Result<Option<OrgView>, OrgError> {
    let row: Option<Row> = sqlx::query_as(&format!(
        "WITH ins AS (
             UPDATE {} SET
                name   = COALESCE($2, name),
                tag    = COALESCE($3, tag),
                intro  = COALESCE($4, intro),
                status = COALESCE($5, status)
              WHERE id = $1
              RETURNING *
         )
         SELECT ins.id, ins.name, ins.tag, ins.game, ins.intro, u.nickname AS owner,
                ins.owner_id, ins.status, ins.points, ins.wins, ins.losses, ins.members,
                ins.created_at
           FROM ins LEFT JOIN users u ON u.id = ins.owner_id",
        kind.table()
    ))
    .bind(id)
    .bind(&patch.name)
    .bind(&patch.tag)
    .bind(&patch.intro)
    .bind(&patch.status)
    .fetch_optional(pool)
    .await
    .map_err(|e| map_db_err(e, kind))?;

    Ok(row.map(|r| r.view(kind)))
}

pub async fn delete(pool: &PgPool, kind: Kind, id: &str) -> Result<bool, sqlx::Error> {
    let affected = sqlx::query(&format!("DELETE FROM {} WHERE id = $1", kind.table()))
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(affected > 0)
}

/// 后台/仲裁校准战绩：`None` 表示不动该字段
#[derive(Debug, Default)]
pub struct StatPatch {
    pub points: Option<i64>,
    pub wins: Option<i64>,
    pub losses: Option<i64>,
    pub members: Option<i64>,
}

pub async fn set_stats(
    pool: &PgPool,
    kind: Kind,
    id: &str,
    patch: &StatPatch,
) -> Result<Option<OrgView>, OrgError> {
    // 负数和超大值都挡在入口：榜单排序依赖这些数，写脏了没法自动发现
    for (label, value) in [
        ("积分", patch.points),
        ("胜场", patch.wins),
        ("负场", patch.losses),
        ("成员数", patch.members),
    ] {
        if let Some(v) = value {
            if !(0..=1_000_000).contains(&v) {
                return Err(OrgError::Invalid(format!("{label}需在 0–1000000 之间")));
            }
        }
    }

    let row: Option<Row> = sqlx::query_as(&format!(
        "WITH ins AS (
             UPDATE {} SET
                points  = COALESCE($2, points),
                wins    = COALESCE($3, wins),
                losses  = COALESCE($4, losses),
                members = COALESCE($5, members)
              WHERE id = $1
              RETURNING *
         )
         SELECT ins.id, ins.name, ins.tag, ins.game, ins.intro, u.nickname AS owner,
                ins.owner_id, ins.status, ins.points, ins.wins, ins.losses, ins.members,
                ins.created_at
           FROM ins LEFT JOIN users u ON u.id = ins.owner_id",
        kind.table()
    ))
    .bind(id)
    .bind(patch.points.map(|v| v as i32))
    .bind(patch.wins.map(|v| v as i32))
    .bind(patch.losses.map(|v| v as i32))
    .bind(patch.members.map(|v| v as i32))
    .fetch_optional(pool)
    .await
    .map_err(|e| map_db_err(e, kind))?;

    Ok(row.map(|r| r.view(kind)))
}

fn map_db_err(e: sqlx::Error, kind: Kind) -> OrgError {
    if let Some(db) = e.as_database_error() {
        if db.code().as_deref() == Some("23505") {
            let constraint = db.constraint().unwrap_or("").to_string();
            let msg = if constraint.ends_with("_owner") {
                format!("你已经负责一个{}了，每人只能有一个", kind.label())
            } else if constraint.ends_with("_name_game") {
                "同一游戏下这个名称已被占用".to_string()
            } else if constraint.ends_with("_tag_game") {
                "同一游戏下这个简称已被占用".to_string()
            } else {
                "名称或简称重复".to_string()
            };
            return OrgError::Duplicate(msg);
        }
    }
    OrgError::Db(e)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> OrgInput {
        OrgInput {
            name: "星轨".into(),
            tag: "星轨".into(),
            game: "minecraft".into(),
            intro: "测试".into(),
        }
    }

    #[test]
    fn normalizes_and_accepts() {
        let mut i = input();
        i.name = "  星轨竞技  ".into();
        i.tag = " xg ".into();
        i.game = "Minecraft".into();
        validate(&mut i).unwrap();
        assert_eq!(i.name, "星轨竞技");
        assert_eq!(i.tag, "XG");
        assert_eq!(i.game, "minecraft");
    }

    #[test]
    fn rejects_bad_values() {
        let mut i = input();
        i.name = "星".into();
        assert!(validate(&mut i).is_err());

        let mut i = input();
        i.tag = "工具人队".into(); // 4 字，允许；5 字才拒绝
        assert!(validate(&mut i).is_ok());
        i.tag = "工具人队伍".into();
        assert!(validate(&mut i).is_err());

        let mut i = input();
        i.tag = "X G".into();
        assert!(validate(&mut i).is_err());

        let mut i = input();
        i.game = "dota".into();
        assert!(validate(&mut i).is_err());

        let mut i = input();
        i.intro = "x".repeat(INTRO_MAX + 1);
        assert!(validate(&mut i).is_err());
    }

    #[test]
    fn status_whitelist() {
        assert!(validate_status("recruiting").is_ok());
        assert!(validate_status("training").is_ok());
        assert!(validate_status("rest").is_ok());
        assert!(validate_status("banned").is_err());
    }

    #[test]
    fn kind_parsing_and_tables() {
        assert_eq!(Kind::parse("guilds"), Some(Kind::Guild));
        assert_eq!(Kind::parse("TEAM"), Some(Kind::Team));
        assert_eq!(Kind::parse("clan"), None);
        assert_eq!(Kind::Guild.table(), "guilds");
        assert_eq!(Kind::Team.table(), "teams");
    }

    #[test]
    fn win_rate_is_zero_without_games() {
        let row = Row {
            id: "g1".into(),
            name: "星轨".into(),
            tag: "XG".into(),
            game: "minecraft".into(),
            intro: String::new(),
            owner: Some("风蚀".into()),
            owner_id: Some("u1".into()),
            status: "recruiting".into(),
            points: 10,
            wins: 0,
            losses: 0,
            members: 3,
            created_at: Utc::now(),
        };
        let view = row.view(Kind::Guild);
        assert_eq!(view.win_rate, 0.0);
        assert_eq!(view.kind, "guild");
    }
}
