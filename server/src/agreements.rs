//! 公约：内置两份 + 后台新增，签署从 Cookie 升级成 `signatures` 表。
//!
//! 过渡策略：读签署状态时**先查表，再回退旧 Cookie**（`ag_<id>=<version>.<epoch>`）。
//! 这样切换前签过的用户不会被判成"没签"，一个版本周期后可以删掉回退分支。

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clause {
    pub h: String,
    pub p: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Agreement {
    pub id: String,
    pub title: String,
    pub short: String,
    pub version: String,
    /// 展示用日期（YYYY-MM-DD）
    pub updated_at: String,
    pub scope: String,
    pub summary: String,
    pub clauses: Vec<Clause>,
    pub gate: String,
    pub active: bool,
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    title: String,
    short: String,
    version: String,
    scope: String,
    summary: String,
    gate: String,
    clauses: Value,
    active: bool,
    builtin: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl Row {
    fn into_view(self) -> Agreement {
        let clauses = self
            .clauses
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| {
                        let h = v.get("h")?.as_str()?.to_string();
                        let p = v.get("p")?.as_str()?.to_string();
                        Some(Clause { h, p })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Agreement {
            id: self.id,
            title: self.title,
            short: self.short,
            version: self.version,
            updated_at: self.updated_at.format("%Y-%m-%d").to_string(),
            scope: self.scope,
            summary: self.summary,
            clauses,
            gate: self.gate,
            active: self.active,
            builtin: self.builtin,
            created_at: Some(self.created_at.to_rfc3339_opts(SecondsFormat::Millis, true)),
        }
    }
}

const COLS: &str = "id, title, short, version, scope, summary, gate, clauses, active, builtin, created_at, updated_at";

/// 内置两份：id 固定，后台不能停用/删除（接口层拦住）
pub async fn ensure_builtin(pool: &PgPool) -> Result<(), sqlx::Error> {
    let builtin = [
        (
            "trust",
            "诚信公约",
            "诚信",
            "v2",
            "2026-10-19",
            "2026-06-01",
            "所有发起或参与约战的玩家与战队",
            "约战的结果由双方共同确认，社区只提供记录与仲裁。这份公约约束的是\"谁在打、打成什么样、结果怎么报\"。",
            "未签署时不能发起约战、提交比分、确认结果或发起争议",
            r#"[
              {"h":"身份真实","p":"绑定的游戏身份必须为本人所有。代打、借号参赛、冒用他人 ID 一律判定违约。"},
              {"h":"名单一致","p":"参赛人员必须与锁定快照一致。替补须在快照名单内，名单外人员上场即违约。"},
              {"h":"结果如实","p":"比分与证据必须如实提交。虚报比分、篡改截图或录像，一经核实封禁 90 天。"},
              {"h":"证据可信","p":"提交的录像与截图须为原始文件或可追溯外链，不得剪辑关键片段。"},
              {"h":"配合仲裁","p":"进入争议后须在 72 小时内举证；拒不配合的，仲裁可作出不利裁定。"}
            ]"#,
        ),
        (
            "community",
            "社区公约",
            "社区",
            "v1.2",
            "2026-10-15",
            "2026-06-01",
            "所有访问社区的账号",
            "社区是玩家自己维护的地方。这份公约管的是发言、发布与相处方式，不涉及比赛结果。",
            "未签署时不能发帖、评论与上传资源",
            r#"[
              {"h":"尊重他人","p":"禁止人身攻击、地域与身份歧视、恶意引战。对事不对人。"},
              {"h":"内容合规","p":"禁止发布违法、色情、暴力内容；转载须注明作者与许可协议。"},
              {"h":"拒绝刷屏","p":"禁止广告、拉群、诱导下载与重复灌水。招募信息请发到对应分区。"},
              {"h":"保护隐私","p":"未经同意不得公开他人真实姓名、联系方式、住址与账号信息。"},
              {"h":"善用举报","p":"遇到违规请举报而非对骂；恶意举报同样会被处理。"}
            ]"#,
        ),
    ];

    for (id, title, short, version, updated, created, scope, summary, gate, clauses) in builtin {
        sqlx::query(
            "INSERT INTO agreements (id, title, short, version, scope, summary, gate, clauses, active, builtin, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, true, true, $9::timestamptz, $10::timestamptz)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(title)
        .bind(short)
        .bind(version)
        .bind(scope)
        .bind(summary)
        .bind(gate)
        .bind(clauses)
        .bind(created)
        .bind(updated)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn list(pool: &PgPool) -> Result<Vec<Agreement>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM agreements ORDER BY builtin DESC, created_at DESC"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

pub async fn list_active(pool: &PgPool) -> Result<Vec<Agreement>, sqlx::Error> {
    Ok(list(pool).await?.into_iter().filter(|a| a.active).collect())
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Agreement>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("SELECT {COLS} FROM agreements WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::into_view))
}

/// 某人是否已按**当前版本**签过
pub async fn is_signed(pool: &PgPool, user_id: &str, id: &str, version: &str) -> bool {
    let hit: Option<String> = sqlx::query_scalar(
        "SELECT version FROM signatures WHERE agreement_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    hit.as_deref() == Some(version)
}

/// 表里没有时回退旧 Cookie（`ag_<id>=<version>.<epoch>`，版本按最后一个点切）
pub async fn is_signed_with_cookie(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    version: &str,
    cookie: Option<&str>,
) -> bool {
    if is_signed(pool, user_id, id, version).await {
        return true;
    }
    let Some(raw) = cookie else { return false };
    match raw.rsplit_once('.') {
        Some((v, _at)) => v == version,
        None => false,
    }
}

/// 签名写入（同版本重复签幂等），返回签署时间（秒）
pub async fn sign(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    version: &str,
) -> Result<i64, sqlx::Error> {
    let signed_at: DateTime<Utc> = sqlx::query_scalar(
        "INSERT INTO signatures (agreement_id, user_id, version, signed_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (agreement_id, user_id) DO UPDATE SET version = EXCLUDED.version, signed_at = now()
         RETURNING signed_at",
    )
    .bind(id)
    .bind(user_id)
    .bind(version)
    .fetch_one(pool)
    .await?;
    Ok(signed_at.timestamp())
}

/// 某人所有生效中的签署（供 `/api/v1/agreements/signatures` 使用）
pub async fn signatures_of(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<(String, String, i64)>, sqlx::Error> {
    let rows: Vec<(String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT agreement_id, version, signed_at FROM signatures WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, v, at)| (id, v, at.timestamp()))
        .collect())
}

pub struct NewAgreement {
    pub title: String,
    pub version: String,
    pub scope: String,
    pub summary: String,
    pub gate: String,
    pub clauses: Vec<Clause>,
}

pub fn validate(input: &NewAgreement) -> Option<&'static str> {
    let title_len = input.title.trim().chars().count();
    if !(2..=20).contains(&title_len) {
        return Some("标题需 2–20 字");
    }
    if input.version.trim().is_empty() {
        return Some("请填写版本号，例如 v1");
    }
    if input.summary.trim().is_empty() {
        return Some("请填写简介");
    }
    if input.scope.trim().is_empty() {
        return Some("请填写适用范围");
    }
    if input.gate.trim().is_empty() {
        return Some("请填写未签署限制");
    }
    if input.clauses.is_empty() {
        return Some("至少填写一条条款");
    }
    None
}

pub async fn create(pool: &PgPool, input: &NewAgreement) -> Result<Agreement, sqlx::Error> {
    let id = format!("c{}", Utc::now().timestamp_millis().max(0));
    let short: String = input.title.trim().chars().take(2).collect();
    let clauses = serde_json::to_value(&input.clauses).unwrap_or_else(|_| Value::Array(vec![]));

    sqlx::query(
        "INSERT INTO agreements (id, title, short, version, scope, summary, gate, clauses, active, builtin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, false)",
    )
    .bind(&id)
    .bind(input.title.trim())
    .bind(&short)
    .bind(input.version.trim())
    .bind(input.scope.trim())
    .bind(input.summary.trim())
    .bind(input.gate.trim())
    .bind(clauses)
    .execute(pool)
    .await?;

    get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn set_active(pool: &PgPool, id: &str, active: bool) -> Result<bool, sqlx::Error> {
    let affected = sqlx::query(
        "UPDATE agreements SET active = $2, updated_at = now() WHERE id = $1 AND NOT builtin",
    )
    .bind(id)
    .bind(active)
    .execute(pool)
    .await?
    .rows_affected();
    Ok(affected > 0)
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let affected = sqlx::query("DELETE FROM agreements WHERE id = $1 AND NOT builtin")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(affected > 0)
}
