//! 站内政策：用户协议、免责声明、隐私政策等。
//!
//! 与「公约」分开：公约强调签署与行为门槛；政策是随时可查阅的声明文本。
//! `show_on_cert=true` 的政策会作为证书底部的免责声明来源（默认 disclaimer）。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub version: String,
    pub published: bool,
    pub show_on_cert: bool,
    pub builtin: bool,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct Row {
    slug: String,
    title: String,
    summary: String,
    body: String,
    version: String,
    published: bool,
    show_on_cert: bool,
    builtin: bool,
    updated_at: DateTime<Utc>,
}

impl Row {
    fn into_view(self) -> Policy {
        Policy {
            slug: self.slug,
            title: self.title,
            summary: self.summary,
            body: self.body,
            version: self.version,
            published: self.published,
            show_on_cert: self.show_on_cert,
            builtin: self.builtin,
            updated_at: self.updated_at.format("%Y-%m-%d").to_string(),
        }
    }
}

const COLS: &str =
    "slug, title, summary, body, version, published, show_on_cert, builtin, updated_at";

pub async fn ensure_builtin(pool: &PgPool) -> Result<(), sqlx::Error> {
    let builtin = [
        (
            "terms",
            "用户协议",
            "使用本站服务前，请阅读并理解本协议。",
            r#"## 一、服务内容

本站提供玩家社区、公会与战队展示、联机大厅信息、赛事记录与名单存证等服务。部分功能需要注册账号并签署相应公约。

## 二、账号

- 你应妥善保管账号与密码，因保管不当造成的损失由账号持有人承担。
- 禁止冒用他人身份、批量注册、出租或买卖账号。
- 发现账号异常时，请及时联系站点管理员。

## 三、内容规范

你发布的内容应真实、合法，不得侵犯他人权益。管理员有权对违规内容进行隐藏、删除或限制账号功能。

## 四、服务变更

站点可能因维护、升级或不可抗力暂停服务。我们会尽量提前公告，但不对因此造成的中断承担赔偿责任。

## 五、协议更新

本协议更新后会在站内公布。继续使用本站服务视为接受更新后的协议。"#,
        ),
        (
            "disclaimer",
            "免责声明",
            "本站仅提供玩家社区与赛事记录服务，不对第三方行为与比赛结果作担保。",
            r#"## 一、信息服务

本站提供的联机服务器状态、比赛记录、榜单与证书，均基于用户提交或公开接口获取的信息整理，仅供参考。

## 二、比赛与交易

玩家之间的约战、交易、组队及其他互动由当事人自行负责。本站不参与、不担保、不承担由此产生的纠纷与损失。

## 三、第三方链接

本站可能包含指向第三方网站或服务的链接。第三方内容由其运营者负责，本站不对其准确性、安全性作任何保证。

## 四、证书说明

站内证书用于证明相关账号在特定时间点的站内状态或签署行为，不构成任何官方资质、营业执照或法律意见。

## 五、责任限制

在法律允许的范围内，本站不对因使用或无法使用服务产生的间接损失承担责任。"#,
        ),
        (
            "privacy",
            "隐私政策",
            "说明我们收集哪些信息、如何使用，以及你可以如何管理自己的数据。",
            r#"## 一、我们收集的信息

- 注册与登录所需的信息，例如用户名、昵称、邮箱（如启用）。
- 你主动发布的内容、上传的图片与签署记录。
- 为保障服务安全所需的必要日志，例如登录时间与请求记录。

## 二、信息的使用

用于提供登录、社区、赛事记录、证书生成与安全防护，不用于与本站服务无关的用途。

## 三、信息的共享

除法律法规要求或你明确同意外，我们不会向第三方出售或共享你的个人信息。

## 四、你的权利

你可以修改个人资料、删除自己发布的内容，或联系管理员处理账号与数据相关请求。

## 五、政策更新

本政策更新后会在站内公布，重大变更会通过公告提示。"#,
        ),
    ];

    for (slug, title, summary, body) in builtin {
        sqlx::query(
            "INSERT INTO policies (slug, title, summary, body, version, published, show_on_cert, builtin)
             VALUES ($1,$2,$3,$4,'v1',true,$5,true)
             ON CONFLICT (slug) DO NOTHING",
        )
        .bind(slug)
        .bind(title)
        .bind(summary)
        .bind(body)
        .bind(slug == "disclaimer")
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn list(pool: &PgPool, published_only: bool) -> Result<Vec<Policy>, sqlx::Error> {
    let sql = if published_only {
        format!("SELECT {COLS} FROM policies WHERE published ORDER BY updated_at DESC, slug")
    } else {
        format!("SELECT {COLS} FROM policies ORDER BY builtin DESC, updated_at DESC, slug")
    };
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

pub async fn get(pool: &PgPool, slug: &str, published_only: bool) -> Result<Option<Policy>, sqlx::Error> {
    let sql = if published_only {
        format!("SELECT {COLS} FROM policies WHERE slug = $1 AND published")
    } else {
        format!("SELECT {COLS} FROM policies WHERE slug = $1")
    };
    let row: Option<Row> = sqlx::query_as(&sql).bind(slug).fetch_optional(pool).await?;
    Ok(row.map(Row::into_view))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPolicy {
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub body: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default = "default_true")]
    pub published: bool,
    #[serde(default)]
    pub show_on_cert: bool,
}

fn default_version() -> String {
    "v1".into()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPolicy {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub body: Option<String>,
    pub version: Option<String>,
    pub published: Option<bool>,
    pub show_on_cert: Option<bool>,
}

pub fn valid_slug(slug: &str) -> bool {
    (2..=40).contains(&slug.len())
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn validate(title: &str, slug: &str) -> Option<&'static str> {
    if !valid_slug(slug) {
        return Some("标识只能使用 2–40 位小写字母、数字或短横线");
    }
    let title_len = title.trim().chars().count();
    if title_len < 2 || title_len > 60 {
        return Some("标题需为 2–60 字");
    }
    None
}

pub async fn create(pool: &PgPool, input: &NewPolicy) -> Result<Option<Policy>, sqlx::Error> {
    let hit: Option<String> = sqlx::query_scalar("SELECT slug FROM policies WHERE slug = $1")
        .bind(&input.slug)
        .fetch_optional(pool)
        .await?;
    if hit.is_some() {
        return Ok(None);
    }
    sqlx::query(
        "INSERT INTO policies (slug, title, summary, body, version, published, show_on_cert)
         VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(&input.slug)
    .bind(input.title.trim())
    .bind(input.summary.trim())
    .bind(&input.body)
    .bind(input.version.trim())
    .bind(input.published)
    .bind(input.show_on_cert)
    .execute(pool)
    .await?;
    get(pool, &input.slug, false).await
}

pub async fn update(
    pool: &PgPool,
    slug: &str,
    patch: &PatchPolicy,
) -> Result<Option<Policy>, sqlx::Error> {
    let Some(mut current) = get(pool, slug, false).await? else {
        return Ok(None);
    };
    if let Some(v) = &patch.title {
        current.title = v.trim().to_string();
    }
    if let Some(v) = &patch.summary {
        current.summary = v.trim().to_string();
    }
    if let Some(v) = &patch.body {
        current.body = v.clone();
    }
    if let Some(v) = &patch.version {
        current.version = v.trim().to_string();
    }
    if let Some(v) = patch.published {
        current.published = v;
    }
    if let Some(v) = patch.show_on_cert {
        current.show_on_cert = v;
    }

    sqlx::query(
        "UPDATE policies SET title=$2, summary=$3, body=$4, version=$5, published=$6,
                show_on_cert=$7, updated_at=now() WHERE slug=$1",
    )
    .bind(slug)
    .bind(&current.title)
    .bind(&current.summary)
    .bind(&current.body)
    .bind(&current.version)
    .bind(current.published)
    .bind(current.show_on_cert)
    .execute(pool)
    .await?;
    get(pool, slug, false).await
}

pub async fn remove(pool: &PgPool, slug: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM policies WHERE slug = $1 AND builtin = false")
        .bind(slug)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
