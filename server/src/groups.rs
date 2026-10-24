//! 身份组：可自由配置的权限集合 + 进组前必须签署的公约。
//!
//! 与 `users.role` 的分工（别混）：
//! - `role` 仍是后台通行证与「最后一个管理员」保护依据，短期内不删；
//! - `group` 是**能力层**：决定能不能发帖/评论/审核，以及进组要先签哪些公约。
//!
//! 判定顺序：`role=admin` 直接拥有全部权限；其余看组的 `permissions`。

use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;

use crate::ids;

/// 权限点清单。新增权限时只改这里，后台勾选项与判定会自动跟上。
pub const PERMISSIONS: [(&str, &str); 8] = [
    ("post.create", "发帖"),
    ("comment.create", "评论"),
    ("post.delete.any", "删除任意帖子"),
    ("audit.review", "审核内容"),
    ("admin.console", "进入后台"),
    ("group.manage", "管理身份组"),
    ("settings.manage", "修改站点设置"),
    ("user.manage", "管理用户"),
];

pub fn is_known_permission(p: &str) -> bool {
    PERMISSIONS.iter().any(|(k, _)| *k == p)
}

/// 过滤掉未知权限点，去重并保序
pub fn normalize_permissions(raw: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for p in raw {
        let p = p.trim();
        if is_known_permission(p) && !out.iter().any(|x| x == p) {
            out.push(p.to_string());
        }
    }
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub color: String,
    pub weight: i32,
    pub is_default: bool,
    pub is_builtin: bool,
    pub permissions: Vec<String>,
    pub required_agreements: Vec<String>,
    /// 列表接口才带；单条读取时为 0
    pub member_count: i64,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    name: String,
    slug: String,
    color: String,
    weight: i32,
    is_default: bool,
    is_builtin: bool,
    permissions: Value,
    required_agreements: Value,
    member_count: i64,
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

impl Row {
    fn into_group(self) -> Group {
        Group {
            permissions: strings(&self.permissions),
            required_agreements: strings(&self.required_agreements),
            id: self.id,
            name: self.name,
            slug: self.slug,
            color: self.color,
            weight: self.weight,
            is_default: self.is_default,
            is_builtin: self.is_builtin,
            member_count: self.member_count,
        }
    }
}

const SELECT: &str = "SELECT g.id, g.name, g.slug, g.color, g.weight, g.is_default, g.is_builtin,
            g.permissions, g.required_agreements,
            (SELECT count(*) FROM users u WHERE u.group_id = g.id) AS member_count
       FROM groups g";

pub async fn list(pool: &PgPool) -> Result<Vec<Group>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "{SELECT} ORDER BY g.weight DESC, g.created_at ASC"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::into_group).collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Group>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("{SELECT} WHERE g.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::into_group))
}

/// 当前生效的默认组（新用户注册时加入）
pub async fn default_group_id(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM groups WHERE is_default ORDER BY weight DESC LIMIT 1")
        .fetch_optional(pool)
        .await
}

pub struct NewGroup<'a> {
    pub name: &'a str,
    pub slug: &'a str,
    pub color: &'a str,
    pub weight: i32,
    pub is_default: bool,
    pub permissions: Vec<String>,
    pub required_agreements: Vec<String>,
}

pub enum GroupError {
    NotFound,
    SlugTaken,
    Builtin,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for GroupError {
    fn from(e: sqlx::Error) -> Self {
        GroupError::Db(e)
    }
}

fn validate(name: &str, slug: &str) -> Result<(), GroupError> {
    let name = name.trim();
    if name.chars().count() < 1 || name.chars().count() > 20 {
        return Err(GroupError::Invalid("组名需 1–20 字".into()));
    }
    let s = slug.trim();
    if s.len() < 2
        || s.len() > 24
        || !s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(GroupError::Invalid(
            "标识需 2–24 位，仅限字母、数字、下划线、短横线".into(),
        ));
    }
    Ok(())
}

pub async fn create(pool: &PgPool, input: NewGroup<'_>) -> Result<Group, GroupError> {
    validate(input.name, input.slug)?;

    let taken: Option<String> =
        sqlx::query_scalar("SELECT id FROM groups WHERE lower(slug) = lower($1)")
            .bind(input.slug.trim())
            .fetch_optional(pool)
            .await?;
    if taken.is_some() {
        return Err(GroupError::SlugTaken);
    }

    let id = ids::next('g');
    let perms = normalize_permissions(&input.permissions);

    let mut tx = pool.begin().await?;
    if input.is_default {
        // 全局只能有一个默认组
        sqlx::query("UPDATE groups SET is_default = false WHERE is_default")
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "INSERT INTO groups (id, name, slug, color, weight, is_default, is_builtin, permissions, required_agreements)
         VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(input.slug.trim())
    .bind(input.color.trim())
    .bind(input.weight)
    .bind(input.is_default)
    .bind(json!(perms))
    .bind(json!(input.required_agreements))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    get(pool, &id).await?.ok_or(GroupError::NotFound)
}

pub struct GroupPatch {
    pub name: Option<String>,
    pub color: Option<String>,
    pub weight: Option<i32>,
    pub is_default: Option<bool>,
    pub permissions: Option<Vec<String>>,
    pub required_agreements: Option<Vec<String>>,
}

pub async fn update(pool: &PgPool, id: &str, patch: GroupPatch) -> Result<Group, GroupError> {
    let current = get(pool, id).await?.ok_or(GroupError::NotFound)?;

    let name = patch.name.unwrap_or_else(|| current.name.clone());
    // slug 不允许改：代码里按 slug 认内置组，改了会静默失效
    validate(&name, &current.slug)?;

    let perms = patch
        .permissions
        .map(|p| normalize_permissions(&p))
        .unwrap_or(current.permissions.clone());
    let agreements = patch
        .required_agreements
        .unwrap_or(current.required_agreements.clone());

    let mut tx = pool.begin().await?;
    if patch.is_default == Some(true) && !current.is_default {
        sqlx::query("UPDATE groups SET is_default = false WHERE is_default")
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "UPDATE groups SET name=$2, color=$3, weight=$4, is_default=$5,
                permissions=$6, required_agreements=$7, updated_at=now()
          WHERE id=$1",
    )
    .bind(id)
    .bind(name.trim())
    .bind(patch.color.unwrap_or(current.color))
    .bind(patch.weight.unwrap_or(current.weight))
    .bind(patch.is_default.unwrap_or(current.is_default))
    .bind(json!(perms))
    .bind(json!(agreements))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    get(pool, id).await?.ok_or(GroupError::NotFound)
}

/// 删除组：内置组拒绝；成员自动回落到默认组，不留悬空引用
pub async fn delete(pool: &PgPool, id: &str) -> Result<(), GroupError> {
    let group = get(pool, id).await?.ok_or(GroupError::NotFound)?;
    if group.is_builtin {
        return Err(GroupError::Builtin);
    }

    let fallback = default_group_id(pool).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE users SET group_id = $2 WHERE group_id = $1")
        .bind(id)
        .bind(fallback.as_deref())
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// 把用户放进某个组
pub async fn assign_user(
    pool: &PgPool,
    user_id: &str,
    group_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET group_id = $2 WHERE id = $1")
        .bind(user_id)
        .bind(group_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 该用户的权限集合（role=admin 视为全量）
pub async fn permissions_of(pool: &PgPool, user_id: &str) -> Result<Vec<String>, sqlx::Error> {
    let row: Option<(String, Option<Value>)> = sqlx::query_as(
        "SELECT u.role, g.permissions
           FROM users u LEFT JOIN groups g ON g.id = u.group_id
          WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some((role, perms)) = row else {
        return Ok(Vec::new());
    };
    if role == "admin" {
        return Ok(PERMISSIONS.iter().map(|(k, _)| k.to_string()).collect());
    }
    Ok(perms.map(|v| strings(&v)).unwrap_or_default())
}

pub async fn can(pool: &PgPool, user_id: &str, permission: &str) -> Result<bool, sqlx::Error> {
    // 管理员判定优先走 SQL，避免为一次判定拉全量权限
    let is_admin: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    if is_admin.as_deref() == Some("admin") {
        return Ok(true);
    }
    let perms: Option<Option<Value>> = sqlx::query_scalar(
        "SELECT g.permissions FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(perms
        .flatten()
        .map(|v| strings(&v).iter().any(|p| p == permission))
        .unwrap_or(false))
}

/// 进组前必须签署的公约 id
pub async fn required_agreements(pool: &PgPool, user_id: &str) -> Result<Vec<String>, sqlx::Error> {
    let row: Option<Value> = sqlx::query_scalar(
        "SELECT g.required_agreements FROM users u JOIN groups g ON g.id = u.group_id WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|v| strings(&v)).unwrap_or_default())
}

/// 启动时写入两个内置组，并把没有组的用户归档到默认组。
///
/// 幂等：已存在就跳过，不会覆盖后台改过的权限。
pub async fn ensure_builtin(pool: &PgPool) -> Result<(), sqlx::Error> {
    let all: Vec<String> = PERMISSIONS.iter().map(|(k, _)| k.to_string()).collect();

    sqlx::query(
        "INSERT INTO groups (id, name, slug, color, weight, is_default, is_builtin, permissions)
         VALUES ('g-member', '成员', 'member', '', 10, true, true, $1)
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(json!(["post.create", "comment.create"]))
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO groups (id, name, slug, color, weight, is_default, is_builtin, permissions)
         VALUES ('g-admin', '管理员', 'admin', '#3e7cff', 100, false, true, $1)
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(json!(all))
    .execute(pool)
    .await?;

    // 老数据回填：没有组的用户进默认组
    sqlx::query(
        "UPDATE users SET group_id = 'g-member'
          WHERE group_id IS NULL AND EXISTS (SELECT 1 FROM groups WHERE id = 'g-member')",
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_permission_is_dropped() {
        let got = normalize_permissions(&[
            "post.create".into(),
            "nonsense".into(),
            "post.create".into(),
            "audit.review".into(),
        ]);
        assert_eq!(got, vec!["post.create", "audit.review"]);
    }
}
