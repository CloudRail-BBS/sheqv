//! 开发团队：面向资源作者的第三种组织。
//!
//! 与公会 / 约战战队**互不相干**：不参加约战、没有积分胜负，
//! 唯一的战绩是「团队名下资源的下载与点赞」。创建者必须是开发者，
//! 成员也必须是开发者——团队不是一个绕开身份的门。

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub user_id: String,
    pub nickname: String,
    pub role: String,
    pub developer: bool,
    pub joined_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevTeamView {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub description: String,
    pub color: String,
    /// 团队头像地址；空表示用简称色块
    #[serde(skip_serializing_if = "String::is_empty")]
    pub logo: String,
    pub game: String,
    pub owner_id: String,
    pub owner: String,
    pub member_count: i64,
    pub resource_count: i64,
    pub downloads: i64,
    pub likes: i64,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members: Option<Vec<Member>>,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    name: String,
    tag: String,
    description: String,
    color: String,
    logo: String,
    game: String,
    owner_id: String,
    owner: String,
    member_count: i64,
    resource_count: i64,
    downloads: i64,
    likes: i64,
    created_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT t.id, t.name, t.tag, t.description, t.color, t.logo, t.game,
            t.owner_id, u.nickname AS owner,
            (SELECT count(*) FROM dev_team_members m WHERE m.team_id = t.id)::bigint AS member_count,
            (SELECT count(*) FROM resources r WHERE r.team_id = t.id AND r.status = 'published')::bigint AS resource_count,
            COALESCE((SELECT sum(r.download_count) FROM resources r
                       WHERE r.team_id = t.id AND r.status = 'published'), 0)::bigint AS downloads,
            COALESCE((SELECT sum(r.like_count) FROM resources r
                       WHERE r.team_id = t.id AND r.status = 'published'), 0)::bigint AS likes,
            t.created_at
       FROM dev_teams t JOIN users u ON u.id = t.owner_id";

impl Row {
    fn into_view(self) -> DevTeamView {
        DevTeamView {
            id: self.id,
            name: self.name,
            tag: self.tag,
            description: self.description,
            color: self.color,
            logo: self.logo,
            game: self.game,
            owner_id: self.owner_id,
            owner: self.owner,
            member_count: self.member_count,
            resource_count: self.resource_count,
            downloads: self.downloads,
            likes: self.likes,
            created_at: self.created_at.timestamp_millis(),
            members: None,
        }
    }
}

pub async fn list(pool: &PgPool, q: Option<&str>) -> Result<Vec<DevTeamView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SELECT}
          WHERE ($1::text IS NULL OR t.name ILIKE '%' || $1 || '%'
                 OR t.tag ILIKE '%' || $1 || '%'
                 OR t.description ILIKE '%' || $1 || '%')
          ORDER BY t.created_at DESC
          LIMIT 120"
    ))
    .bind(q)
    .fetch_all(pool)
    .await?;
    // 排序放在 Rust 里：别名不能直接参与 SQL 表达式，重复子查询又太脏
    let mut items: Vec<DevTeamView> = rows.into_iter().map(Row::into_view).collect();
    items.sort_by(|a, b| {
        let sa = a.resource_count * 4 + a.downloads + a.likes * 3;
        let sb = b.resource_count * 4 + b.downloads + b.likes * 3;
        sb.cmp(&sa).then(b.created_at.cmp(&a.created_at))
    });
    Ok(items)
}

/// 某个用户所在的团队（个人主页用）
pub async fn list_for_user(pool: &PgPool, user_id: &str) -> Result<Vec<DevTeamView>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SELECT}
           JOIN dev_team_members m ON m.team_id = t.id
          WHERE m.user_id = $1
          ORDER BY m.joined_at ASC"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<DevTeamView>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("{SELECT} WHERE t.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let mut view = row.into_view();

    let members: Vec<(String, String, String, bool, DateTime<Utc>)> = sqlx::query_as(
        "SELECT m.user_id, u.nickname, m.role, (u.developer_at IS NOT NULL) AS developer, m.joined_at
           FROM dev_team_members m JOIN users u ON u.id = m.user_id
          WHERE m.team_id = $1
          ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.joined_at ASC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    view.members = Some(
        members
            .into_iter()
            .map(|(user_id, nickname, role, developer, joined_at)| Member {
                user_id,
                nickname,
                role,
                developer,
                joined_at: joined_at.timestamp_millis(),
            })
            .collect(),
    );
    Ok(Some(view))
}

pub struct NewDevTeam<'a> {
    pub name: &'a str,
    pub tag: &'a str,
    pub description: &'a str,
    pub color: &'a str,
    pub logo: &'a str,
    pub game: &'a str,
}

pub fn validate(input: &NewDevTeam<'_>) -> Option<String> {
    let n = input.name.trim().chars().count();
    if !(2..=20).contains(&n) {
        return Some("团队名需 2–20 字".into());
    }
    let t = input.tag.trim().chars().count();
    if !(2..=8).contains(&t) {
        return Some("简称需 2–8 字".into());
    }
    if input.description.trim().chars().count() > 300 {
        return Some("简介不能超过 300 字".into());
    }
    let color = input.color.trim();
    if !color.is_empty()
        && !(color.starts_with('#')
            && (color.len() == 4 || color.len() == 7)
            && color[1..].chars().all(|c| c.is_ascii_hexdigit()))
    {
        return Some("颜色需写成 #rgb 或 #rrggbb".into());
    }
    let logo = input.logo.trim();
    let logo_ok = logo.is_empty()
        || ((logo.starts_with("http://") || logo.starts_with("https://")
            || (logo.starts_with('/') && !logo.starts_with("//")))
            && logo.len() <= 500);
    if !logo_ok {
        return Some("头像需为 http(s) 链接或站内路径（/ 开头），最长 500 字".into());
    }
    if !matches!(input.game, "" | "minecraft" | "rusted_warfare") {
        return Some("游戏类型不正确".into());
    }
    None
}

pub async fn is_developer(pool: &PgPool, user_id: &str) -> Result<bool, sqlx::Error> {
    let v: Option<bool> =
        sqlx::query_scalar("SELECT developer_at IS NOT NULL FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
    Ok(v.unwrap_or(false))
}

pub async fn owns_any(pool: &PgPool, user_id: &str) -> Result<bool, sqlx::Error> {
    let hit: Option<String> = sqlx::query_scalar("SELECT id FROM dev_teams WHERE owner_id = $1 LIMIT 1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(hit.is_some())
}

pub enum TeamError {
    NameTaken,
    TagTaken,
    NotFound,
    NotDeveloper,
    AlreadyOwned,
    UserNotFound,
    AlreadyMember,
    MemberLimit,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for TeamError {
    fn from(e: sqlx::Error) -> Self {
        TeamError::Db(e)
    }
}

pub async fn create(pool: &PgPool, owner_id: &str, input: &NewDevTeam<'_>) -> Result<String, TeamError> {
    if let Some(msg) = validate(input) {
        return Err(TeamError::Invalid(msg));
    }
    if !is_developer(pool, owner_id).await? {
        return Err(TeamError::NotDeveloper);
    }
    if owns_any(pool, owner_id).await? {
        return Err(TeamError::AlreadyOwned);
    }

    let name_taken: Option<String> =
        sqlx::query_scalar("SELECT id FROM dev_teams WHERE lower(name) = lower($1)")
            .bind(input.name.trim())
            .fetch_optional(pool)
            .await?;
    if name_taken.is_some() {
        return Err(TeamError::NameTaken);
    }
    let tag_taken: Option<String> =
        sqlx::query_scalar("SELECT id FROM dev_teams WHERE upper(tag) = upper($1)")
            .bind(input.tag.trim())
            .fetch_optional(pool)
            .await?;
    if tag_taken.is_some() {
        return Err(TeamError::TagTaken);
    }

    let id = crate::ids::next('d');
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO dev_teams (id, name, tag, description, color, logo, game, owner_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(input.tag.trim())
    .bind(input.description.trim())
    .bind(if input.color.trim().is_empty() {
        "#3e7cff"
    } else {
        input.color.trim()
    })
    .bind(input.logo.trim())
    .bind(input.game)
    .bind(owner_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO dev_team_members (team_id, user_id, role) VALUES ($1,$2,'owner')")
        .bind(&id)
        .bind(owner_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(id)
}

pub struct TeamPatch<'a> {
    pub name: Option<&'a str>,
    pub tag: Option<&'a str>,
    pub description: Option<&'a str>,
    pub color: Option<&'a str>,
    pub logo: Option<&'a str>,
    pub game: Option<&'a str>,
}

pub async fn patch(pool: &PgPool, id: &str, patch: TeamPatch<'_>) -> Result<Option<DevTeamView>, TeamError> {
    let Some(cur) = get(pool, id).await? else {
        return Err(TeamError::NotFound);
    };
    let name = patch.name.unwrap_or(&cur.name);
    let tag = patch.tag.unwrap_or(&cur.tag);
    let description = patch.description.unwrap_or(&cur.description);
    let color = patch.color.unwrap_or(&cur.color);
    let logo = patch.logo.unwrap_or(&cur.logo);
    let game = patch.game.unwrap_or(&cur.game);

    let check = NewDevTeam {
        name,
        tag,
        description,
        color,
        logo,
        game,
    };
    if let Some(msg) = validate(&check) {
        return Err(TeamError::Invalid(msg));
    }

    let name_taken: Option<String> =
        sqlx::query_scalar("SELECT id FROM dev_teams WHERE lower(name) = lower($1) AND id <> $2")
            .bind(name.trim())
            .bind(id)
            .fetch_optional(pool)
            .await?;
    if name_taken.is_some() {
        return Err(TeamError::NameTaken);
    }
    let tag_taken: Option<String> =
        sqlx::query_scalar("SELECT id FROM dev_teams WHERE upper(tag) = upper($1) AND id <> $2")
            .bind(tag.trim())
            .bind(id)
            .fetch_optional(pool)
            .await?;
    if tag_taken.is_some() {
        return Err(TeamError::TagTaken);
    }

    sqlx::query(
        "UPDATE dev_teams SET name=$2, tag=$3, description=$4, color=$5, logo=$6, game=$7, updated_at=now()
          WHERE id=$1",
    )
    .bind(id)
    .bind(name.trim())
    .bind(tag.trim())
    .bind(description.trim())
    .bind(color.trim())
    .bind(logo.trim())
    .bind(game)
    .execute(pool)
    .await?;

    Ok(get(pool, id).await?)
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM dev_teams WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 按昵称加人：对方必须是开发者，且不能已经在队里
pub async fn add_member(pool: &PgPool, team_id: &str, nickname: &str) -> Result<(), TeamError> {
    let rows: Vec<(String, bool)> = sqlx::query_as(
        "SELECT id, developer_at IS NOT NULL FROM users WHERE lower(nickname) = lower($1) LIMIT 1",
    )
    .bind(nickname.trim())
    .fetch_all(pool)
    .await?;
    let Some((user_id, developer)) = rows.into_iter().next() else {
        return Err(TeamError::UserNotFound);
    };
    if !developer {
        return Err(TeamError::NotDeveloper);
    }

    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM dev_team_members WHERE team_id = $1")
        .bind(team_id)
        .fetch_one(pool)
        .await?;
    if count >= 20 {
        return Err(TeamError::MemberLimit);
    }

    let done = sqlx::query(
        "INSERT INTO dev_team_members (team_id, user_id, role) VALUES ($1,$2,'member')
         ON CONFLICT DO NOTHING",
    )
    .bind(team_id)
    .bind(&user_id)
    .execute(pool)
    .await?;
    if done.rows_affected() == 0 {
        return Err(TeamError::AlreadyMember);
    }
    Ok(())
}

pub async fn remove_member(pool: &PgPool, team_id: &str, user_id: &str) -> Result<(), TeamError> {
    let owner: Option<String> = sqlx::query_scalar("SELECT owner_id FROM dev_teams WHERE id = $1")
        .bind(team_id)
        .fetch_optional(pool)
        .await?;
    let Some(owner) = owner else {
        return Err(TeamError::NotFound);
    };
    if owner == user_id {
        return Err(TeamError::Invalid("不能移除负责人".into()));
    }
    sqlx::query("DELETE FROM dev_team_members WHERE team_id = $1 AND user_id = $2")
        .bind(team_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn team() -> NewDevTeam<'static> {
        NewDevTeam {
            name: "云轨工坊",
            tag: "CRW",
            description: "",
            color: "#0ea5e9",
            logo: "",
            game: "minecraft",
        }
    }

    #[test]
    fn accepts_basic_team() {
        assert!(validate(&team()).is_none());
    }

    #[test]
    fn rejects_bad_color_and_game() {
        let mut t = team();
        t.color = "blue";
        assert!(validate(&t).is_some());

        let mut t = team();
        t.game = "dota";
        assert!(validate(&t).is_some());
    }

    #[test]
    fn rejects_short_tag() {
        let mut t = team();
        t.tag = "C";
        assert!(validate(&t).is_some());
    }
}
