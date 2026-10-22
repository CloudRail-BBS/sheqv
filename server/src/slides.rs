//! 首页轮播：后台可改文案、链接、背景色/图、文字明暗与顺序。
//!
//! `href` 与颜色都做白名单校验——这些值会直接进 `style` 与 `href`，
//! 不做校验等于给自己开一个 XSS 口子。

use chrono::Utc;
use serde::Serialize;
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Slide {
    pub id: String,
    pub kicker: String,
    pub title: String,
    pub desc: String,
    pub cta: String,
    pub href: String,
    pub bg_color: String,
    pub bg_image: String,
    pub text_tone: String,
    pub active: bool,
    pub order: i32,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    kicker: String,
    title: String,
    desc: String,
    cta: String,
    href: String,
    bg_color: String,
    bg_image: String,
    text_tone: String,
    active: bool,
    ord: i32,
}

impl Row {
    fn view(self) -> Slide {
        Slide {
            id: self.id,
            kicker: self.kicker,
            title: self.title,
            desc: self.desc,
            cta: self.cta,
            href: self.href,
            bg_color: self.bg_color,
            bg_image: self.bg_image,
            text_tone: self.text_tone,
            active: self.active,
            order: self.ord,
        }
    }
}

const COLS: &str =
    "id, kicker, title, \"desc\", cta, href, bg_color, bg_image, text_tone, active, ord";

/// 只放行站内路径与 http(s)，其余一律回落到 `/`
pub fn safe_href(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return "/".to_string();
    }
    if s.starts_with('/') {
        return s.to_string();
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return s.to_string();
    }
    "/".to_string()
}

/// `#rgb` / `#rrggbbaa` / `rgb()` / `rgba()`，其余回落到深灰
pub fn safe_color(raw: &str) -> String {
    let s = raw.trim();
    let hex = s
        .strip_prefix('#')
        .map(|h| h.len() >= 3 && h.len() <= 8 && h.chars().all(|c| c.is_ascii_hexdigit()));
    if hex == Some(true) {
        return s.to_string();
    }
    let lower = s.to_ascii_lowercase();
    if (lower.starts_with("rgb(") || lower.starts_with("rgba(")) && s.ends_with(')') {
        let inner = &s[s.find('(').map(|i| i + 1).unwrap_or(0)..s.len() - 1];
        if !inner.is_empty()
            && inner
                .chars()
                .all(|c| c.is_ascii_digit() || matches!(c, ' ' | ',' | '.' | '%'))
        {
            return s.to_string();
        }
    }
    "#1b1b1e".to_string()
}

pub fn validate(title: &str, desc: &str, cta: &str) -> Option<&'static str> {
    let title_len = title.chars().count();
    if !(2..=48).contains(&title_len) {
        return Some("标题需 2–48 字");
    }
    if desc.chars().count() > 160 {
        return Some("描述不超过 160 字");
    }
    if cta.chars().count() > 12 {
        return Some("按钮文案不超过 12 字");
    }
    None
}

pub struct Input<'a> {
    pub kicker: &'a str,
    pub title: &'a str,
    pub desc: &'a str,
    pub cta: &'a str,
    pub href: &'a str,
    pub bg_color: &'a str,
    pub bg_image: &'a str,
    pub text_tone: &'a str,
    pub active: bool,
    pub order: i32,
}

pub async fn list(pool: &PgPool, only_active: bool) -> Result<Vec<Slide>, sqlx::Error> {
    let sql = if only_active {
        format!("SELECT {COLS} FROM slides WHERE active ORDER BY ord ASC, id ASC")
    } else {
        format!("SELECT {COLS} FROM slides ORDER BY ord ASC, id ASC")
    };
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(Row::view).collect())
}

pub async fn create(pool: &PgPool, input: Input<'_>) -> Result<Slide, sqlx::Error> {
    let id = format!("s{}", Utc::now().timestamp_millis().max(0));
    sqlx::query(
        "INSERT INTO slides (id, kicker, title, \"desc\", cta, href, bg_color, bg_image, text_tone, active, ord)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    )
    .bind(&id)
    .bind(input.kicker.trim())
    .bind(input.title.trim())
    .bind(input.desc.trim())
    .bind(input.cta.trim())
    .bind(safe_href(input.href))
    .bind(safe_color(input.bg_color))
    .bind(input.bg_image.trim())
    .bind(match input.text_tone {
        "dark" => "dark",
        _ => "light",
    })
    .bind(input.active)
    .bind(input.order)
    .execute(pool)
    .await?;

    get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Slide>, sqlx::Error> {
    let row: Option<Row> = sqlx::query_as(&format!("SELECT {COLS} FROM slides WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(Row::view))
}

pub struct Patch<'a> {
    pub kicker: Option<&'a str>,
    pub title: Option<&'a str>,
    pub desc: Option<&'a str>,
    pub cta: Option<&'a str>,
    pub href: Option<&'a str>,
    pub bg_color: Option<&'a str>,
    pub bg_image: Option<&'a str>,
    pub text_tone: Option<&'a str>,
    pub active: Option<bool>,
    pub order: Option<i32>,
}

pub async fn update(pool: &PgPool, id: &str, p: Patch<'_>) -> Result<Option<Slide>, sqlx::Error> {
    let href = p.href.map(safe_href);
    let bg = p.bg_color.map(safe_color);
    let tone = p
        .text_tone
        .map(|t| if t == "dark" { "dark" } else { "light" });

    let row: Option<Row> = sqlx::query_as(&format!(
        "UPDATE slides SET
            kicker = COALESCE($2, kicker), title = COALESCE($3, title),
            \"desc\" = COALESCE($4, \"desc\"), cta = COALESCE($5, cta),
            href = COALESCE($6, href), bg_color = COALESCE($7, bg_color),
            bg_image = COALESCE($8, bg_image), text_tone = COALESCE($9, text_tone),
            active = COALESCE($10, active), ord = COALESCE($11, ord)
         WHERE id = $1 RETURNING {COLS}"
    ))
    .bind(id)
    .bind(p.kicker)
    .bind(p.title)
    .bind(p.desc)
    .bind(p.cta)
    .bind(href)
    .bind(bg)
    .bind(p.bg_image)
    .bind(tone)
    .bind(p.active)
    .bind(p.order)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(Row::view))
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let n = sqlx::query("DELETE FROM slides WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(n > 0)
}
