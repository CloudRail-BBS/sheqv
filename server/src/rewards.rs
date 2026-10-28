//! 礼品卡 / 兑换码 / 抽奖。
//!
//! 三种东西共用一张 `gift_cards` 表：
//! * `kind=gift`：后台点名发给某人，在「我的礼品卡」里，拆开有获得特效；
//! * `kind=code`：公开兑换码，谁先兑谁得，只能兑一次；
//! * 抽奖抽到「礼品卡」时，也现场生成一张 `gift` 发给中奖者。
//!
//! 发奖与扣分必须在**同一事务**里完成，否则会出现「卡已用掉但积分没加」。

use chrono::{DateTime, Utc};
use rand::Rng;
use serde::Serialize;
use sqlx::{PgPool, Postgres, Transaction};

use crate::points;

/// 单次抽奖消耗
pub const LOTTERY_COST: i64 = 20;

/// 去掉容易看错的字符（0/O、1/I），兑换码要能手抄
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardView {
    pub id: String,
    pub kind: String,
    pub code: String,
    pub title: String,
    pub note: String,
    pub theme: String,
    pub reward_points: i64,
    pub reward_kind: String,
    pub reward_value: String,
    /// 自定义奖品的图片与说明（实物 / 周边 / 激活码）
    pub reward_image: String,
    pub reward_desc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    pub created_at: i64,
}

#[derive(sqlx::FromRow)]
struct CardRow {
    id: String,
    kind: String,
    code: String,
    title: String,
    note: String,
    theme: String,
    reward_points: i32,
    reward_kind: String,
    reward_value: String,
    reward_image: String,
    reward_desc: String,
    assigned_user_id: Option<String>,
    used_by: Option<String>,
    used_at: Option<DateTime<Utc>>,
    expires_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

const CARD_COLUMNS: &str = "id, kind, code, title, note, theme, reward_points, reward_kind,
        reward_value, reward_image, reward_desc,
        assigned_user_id, used_by, used_at, expires_at, created_at";

impl CardRow {
    fn into_view(self) -> CardView {
        CardView {
            id: self.id,
            kind: self.kind,
            code: self.code,
            title: self.title,
            note: self.note,
            theme: self.theme,
            reward_points: self.reward_points as i64,
            reward_kind: self.reward_kind,
            reward_value: self.reward_value,
            reward_image: self.reward_image,
            reward_desc: self.reward_desc,
            assigned_user_id: self.assigned_user_id,
            used_at: self.used_at.map(|t| t.timestamp_millis()),
            expires_at: self.expires_at.map(|t| t.timestamp_millis()),
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

pub enum RewardError {
    NotFound,
    Used,
    Expired,
    Insufficient,
    NoPrize,
    Invalid(String),
    Db(sqlx::Error),
}

impl From<sqlx::Error> for RewardError {
    fn from(e: sqlx::Error) -> Self {
        RewardError::Db(e)
    }
}

fn make_code() -> String {
    let mut rng = rand::rng();
    (0..10)
        .map(|_| CODE_ALPHABET[rng.random_range(0..CODE_ALPHABET.len())] as char)
        .collect()
}

/* ── 用户侧 ─────────────────────────────── */

pub struct Mine {
    pub cards: Vec<CardView>,
    pub history: Vec<CardView>,
}

pub async fn mine(pool: &PgPool, user_id: &str) -> Result<Mine, sqlx::Error> {
    let cards: Vec<CardRow> = sqlx::query_as(&format!(
        "SELECT {CARD_COLUMNS} FROM gift_cards
          WHERE assigned_user_id = $1 AND used_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let history: Vec<CardRow> = sqlx::query_as(&format!(
        "SELECT {CARD_COLUMNS} FROM gift_cards
          WHERE used_by = $1
          ORDER BY used_at DESC NULLS LAST
          LIMIT 20"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(Mine {
        cards: cards.into_iter().map(CardRow::into_view).collect(),
        history: history.into_iter().map(CardRow::into_view).collect(),
    })
}

/// 发奖 + 返回余额。`reason` 决定流水里怎么显示。
async fn grant(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    points_reward: i64,
    reward_kind: &str,
    reward_value: &str,
    reason: &str,
    reference: &str,
) -> Result<i64, sqlx::Error> {
    if points_reward > 0 {
        points::award_in(tx, user_id, points_reward, reason, Some(reference)).await?;
    }
    if reward_kind == "title" && !reward_value.trim().is_empty() {
        let title: String = reward_value.trim().chars().take(8).collect();
        sqlx::query("UPDATE users SET title = $2 WHERE id = $1")
            .bind(user_id)
            .bind(title)
            .execute(&mut **tx)
            .await?;
    }
    let balance: Option<i32> = sqlx::query_scalar("SELECT points FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(balance.unwrap_or(0) as i64)
}

pub struct Opened {
    pub title: String,
    pub points: i64,
    pub reward_points: i64,
    pub reward_kind: String,
    pub reward_value: String,
    pub reward_image: String,
    pub reward_desc: String,
    pub note: String,
    pub balance: i64,
}

/// 拆开一张点名发给自己的礼品卡
pub async fn open(pool: &PgPool, user_id: &str, card_id: &str) -> Result<Opened, RewardError> {
    let mut tx = pool.begin().await?;
    let row: Option<CardRow> = sqlx::query_as(&format!(
        "SELECT {CARD_COLUMNS} FROM gift_cards
          WHERE id = $1 AND assigned_user_id = $2
          FOR UPDATE"
    ))
    .bind(card_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(card) = row else {
        return Err(RewardError::NotFound);
    };
    if card.used_at.is_some() || card.used_by.is_some() {
        return Err(RewardError::Used);
    }
    if let Some(exp) = card.expires_at {
        if exp <= Utc::now() {
            return Err(RewardError::Expired);
        }
    }

    sqlx::query("UPDATE gift_cards SET used_by = $2, used_at = now() WHERE id = $1")
        .bind(&card.id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    let balance = grant(
        &mut tx,
        user_id,
        card.reward_points as i64,
        &card.reward_kind,
        &card.reward_value,
        "gift",
        &card.id,
    )
    .await?;

    tx.commit().await?;
    Ok(Opened {
        title: card.title,
        points: card.reward_points as i64,
        reward_points: card.reward_points as i64,
        reward_kind: card.reward_kind,
        reward_value: card.reward_value,
        reward_image: card.reward_image,
        reward_desc: card.reward_desc,
        note: card.note,
        balance,
    })
}

/// 输入兑换码
pub async fn redeem(pool: &PgPool, user_id: &str, raw: &str) -> Result<Opened, RewardError> {
    let code = raw.trim().to_uppercase();
    if code.len() < 4 || code.len() > 32 {
        return Err(RewardError::Invalid("兑换码长度不正确".into()));
    }

    let mut tx = pool.begin().await?;
    let row: Option<CardRow> = sqlx::query_as(&format!(
        "SELECT {CARD_COLUMNS} FROM gift_cards
          WHERE kind = 'code' AND upper(code) = $1
          FOR UPDATE"
    ))
    .bind(&code)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(card) = row else {
        return Err(RewardError::NotFound);
    };
    if card.used_by.is_some() {
        return Err(RewardError::Used);
    }
    if let Some(exp) = card.expires_at {
        if exp <= Utc::now() {
            return Err(RewardError::Expired);
        }
    }

    sqlx::query("UPDATE gift_cards SET used_by = $2, used_at = now() WHERE id = $1")
        .bind(&card.id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    let balance = grant(
        &mut tx,
        user_id,
        card.reward_points as i64,
        &card.reward_kind,
        &card.reward_value,
        "redeem",
        &card.id,
    )
    .await?;

    tx.commit().await?;
    Ok(Opened {
        title: card.title,
        points: card.reward_points as i64,
        reward_points: card.reward_points as i64,
        reward_kind: card.reward_kind,
        reward_value: card.reward_value,
        reward_image: card.reward_image,
        reward_desc: card.reward_desc,
        note: card.note,
        balance,
    })
}

/* ── 后台发卡 ───────────────────────────── */

pub struct NewCard<'a> {
    pub kind: &'a str,
    pub title: &'a str,
    pub note: &'a str,
    pub theme: &'a str,
    pub reward_points: i64,
    pub reward_kind: &'a str,
    pub reward_value: &'a str,
    pub reward_image: &'a str,
    pub reward_desc: &'a str,
    pub assigned_user_id: Option<&'a str>,
    pub count: i64,
    pub expires_days: i64,
}

pub async fn create(pool: &PgPool, admin_id: Option<&str>, input: &NewCard<'_>) -> Result<Vec<CardView>, RewardError> {
    if !matches!(input.kind, "gift" | "code") {
        return Err(RewardError::Invalid("卡类型不正确".into()));
    }
    if input.title.trim().is_empty() || input.title.trim().chars().count() > 30 {
        return Err(RewardError::Invalid("卡名需 1–30 字".into()));
    }
    if !matches!(input.reward_kind, "" | "title" | "custom") {
        return Err(RewardError::Invalid("奖励类型不正确".into()));
    }
    if input.reward_kind == "custom" && input.reward_value.trim().is_empty() {
        return Err(RewardError::Invalid("自定义奖品要写清奖品名称".into()));
    }
    if input.reward_desc.trim().chars().count() > 300 {
        return Err(RewardError::Invalid("奖品说明不能超过 300 字".into()));
    }
    if input.kind == "gift" && input.assigned_user_id.is_none() {
        return Err(RewardError::Invalid("礼品卡必须指定收件人".into()));
    }
    if input.kind == "code" && !(1..=100).contains(&input.count) {
        return Err(RewardError::Invalid("一次最多生成 100 个兑换码".into()));
    }

    let expires = if input.expires_days > 0 {
        Some(Utc::now() + chrono::Duration::days(input.expires_days.min(3650)))
    } else {
        None
    };
    let theme = if input.theme.trim().is_empty() {
        "#3e7cff"
    } else {
        input.theme.trim()
    };
    let n = if input.kind == "gift" { 1 } else { input.count };

    let mut out = Vec::new();
    for _ in 0..n {
        let id = crate::ids::next('k');
        let mut card_code = make_code();
        // 极小概率撞码：重试几次，不靠 ON CONFLICT 掩盖
        for _ in 0..5 {
            let taken: Option<String> =
                sqlx::query_scalar("SELECT id FROM gift_cards WHERE code = $1")
                    .bind(&card_code)
                    .fetch_optional(pool)
                    .await?;
            if taken.is_none() {
                break;
            }
            card_code = make_code();
        }

        let row: CardRow = sqlx::query_as(&format!(
            "INSERT INTO gift_cards
                 (id, kind, code, title, note, theme, reward_points, reward_kind, reward_value,
                  reward_image, reward_desc, assigned_user_id, expires_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING {CARD_COLUMNS}"
        ))
        .bind(&id)
        .bind(input.kind)
        .bind(&card_code)
        .bind(input.title.trim())
        .bind(input.note.trim())
        .bind(theme)
        .bind(input.reward_points as i32)
        .bind(input.reward_kind)
        .bind(input.reward_value.trim())
        .bind(input.reward_image.trim())
        .bind(input.reward_desc.trim())
        .bind(input.assigned_user_id)
        .bind(expires)
        .bind(admin_id)
        .fetch_one(pool)
        .await?;

        out.push(row.into_view());
    }
    Ok(out)
}

pub async fn admin_list(pool: &PgPool) -> Result<Vec<CardView>, sqlx::Error> {
    let rows: Vec<CardRow> = sqlx::query_as(&format!(
        "SELECT {CARD_COLUMNS} FROM gift_cards ORDER BY created_at DESC LIMIT 200"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(CardRow::into_view).collect())
}

pub async fn admin_delete(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM gift_cards WHERE id = $1 AND used_at IS NULL")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/* ── 抽奖 ───────────────────────────────── */

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PrizeView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub points: i64,
    pub theme: String,
    /// 自定义奖品：名称 / 说明 / 图片
    pub custom_title: String,
    pub custom_desc: String,
    pub custom_image: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stock: Option<i64>,
    pub weight: i64,
    pub enabled: bool,
}

pub async fn prizes(pool: &PgPool) -> Result<Vec<PrizeView>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, name, kind, points::bigint AS points, gift_theme AS theme,
                custom_title, custom_desc, custom_image,
                stock::bigint AS stock, weight::bigint AS weight, enabled
           FROM lottery_prizes ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub struct PrizeInput<'a> {
    pub name: &'a str,
    pub kind: &'a str,
    pub points: i64,
    pub theme: &'a str,
    pub custom_title: &'a str,
    pub custom_desc: &'a str,
    pub custom_image: &'a str,
    pub weight: i64,
    pub stock: Option<i64>,
    pub enabled: bool,
}

pub async fn create_prize(pool: &PgPool, input: &PrizeInput<'_>) -> Result<String, RewardError> {
    if input.name.trim().is_empty() {
        return Err(RewardError::Invalid("奖品名不能为空".into()));
    }
    if !matches!(input.kind, "points" | "gift" | "custom" | "none") {
        return Err(RewardError::Invalid("奖品类型不正确".into()));
    }
    if input.kind == "custom" && input.custom_title.trim().is_empty() {
        return Err(RewardError::Invalid("自定义奖品要写清名称".into()));
    }
    if input.custom_desc.trim().chars().count() > 300 {
        return Err(RewardError::Invalid("奖品说明不能超过 300 字".into()));
    }
    let id = crate::ids::next('z');
    sqlx::query(
        "INSERT INTO lottery_prizes
             (id, name, kind, points, gift_title, gift_theme,
              custom_title, custom_desc, custom_image, weight, stock, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(input.kind)
    .bind(input.points as i32)
    .bind(input.name.trim())
    .bind(if input.theme.trim().is_empty() { "#3e7cff" } else { input.theme.trim() })
    .bind(input.custom_title.trim())
    .bind(input.custom_desc.trim())
    .bind(input.custom_image.trim())
    .bind(input.weight.clamp(1, 10000) as i32)
    .bind(input.stock)
    .bind(input.enabled)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn patch_prize(
    pool: &PgPool,
    id: &str,
    enabled: Option<bool>,
    weight: Option<i64>,
    stock: Option<Option<i64>>,
) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE lottery_prizes SET
            enabled = COALESCE($2, enabled),
            weight = COALESCE($3, weight),
            stock = CASE WHEN $4::boolean THEN $5 ELSE stock END
          WHERE id = $1",
    )
    .bind(id)
    .bind(enabled)
    .bind(weight.map(|w| w.clamp(1, 10000) as i32))
    .bind(stock.is_some())
    .bind(stock.flatten())
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn delete_prize(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM lottery_prizes WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

#[derive(sqlx::FromRow)]
struct DrawPrize {
    id: String,
    name: String,
    kind: String,
    points: i32,
    gift_title: String,
    gift_theme: String,
    custom_title: String,
    custom_desc: String,
    custom_image: String,
    weight: i32,
    stock: Option<i32>,
}

pub struct DrawResult {
    pub prize_name: String,
    pub kind: String,
    pub points: i64,
    /// 抽到礼品卡时，卡里含多少积分（与直接发放的 points 区分）
    pub gift_points: i64,
    pub theme: String,
    pub card_id: Option<String>,
    /// 自定义奖品的展示信息（卡片里也有一份，这里给抽奖弹窗直接用）
    pub custom_title: String,
    pub custom_desc: String,
    pub custom_image: String,
    pub balance: i64,
}

/// 扣积分 → 按权重抽 → 发奖，全程一个事务
pub async fn draw(pool: &PgPool, user_id: &str) -> Result<DrawResult, RewardError> {
    let list: Vec<DrawPrize> = sqlx::query_as(
        "SELECT id, name, kind, points, gift_title, gift_theme,
                custom_title, custom_desc, custom_image, weight, stock
           FROM lottery_prizes
          WHERE enabled AND (stock IS NULL OR stock > 0)",
    )
    .fetch_all(pool)
    .await?;
    if list.is_empty() {
        return Err(RewardError::NoPrize);
    }

    let total: i64 = list.iter().map(|p| p.weight.max(0) as i64).sum();
    if total <= 0 {
        return Err(RewardError::NoPrize);
    }
    let mut roll = rand::rng().random_range(0..total);
    let mut picked = &list[0];
    for p in &list {
        let w = p.weight.max(0) as i64;
        if roll < w {
            picked = p;
            break;
        }
        roll -= w;
    }

    let mut tx = pool.begin().await?;

    // 余额不足直接回滚，不写任何流水
    let left: Option<i32> = sqlx::query_scalar(
        "UPDATE users SET points = points - $2 WHERE id = $1 AND points >= $2 RETURNING points",
    )
    .bind(user_id)
    .bind(LOTTERY_COST as i32)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(_) = left else {
        tx.rollback().await?;
        return Err(RewardError::Insufficient);
    };
    sqlx::query(
        "INSERT INTO point_logs (id, user_id, delta, reason, ref) VALUES ($1,$2,$3,'lottery',$4)",
    )
    .bind(crate::ids::next('l'))
    .bind(user_id)
    .bind(-(LOTTERY_COST as i32))
    .bind(&picked.id)
    .execute(&mut *tx)
    .await?;

    // 限量奖：扣库存与判断放在同一条语句里，避免并发超发
    if picked.stock.is_some() {
        let ok: Option<i32> = sqlx::query_scalar(
            "UPDATE lottery_prizes SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock",
        )
        .bind(&picked.id)
        .fetch_optional(&mut *tx)
        .await?;
        if ok.is_none() {
            tx.rollback().await?;
            return Err(RewardError::NoPrize);
        }
    }

    let mut card_id = None;
    let mut prize_points = 0;
    let mut gift_points = 0;
    match picked.kind.as_str() {
        "points" => {
            prize_points = picked.points as i64;
            if prize_points > 0 {
                points::award_in(&mut tx, user_id, prize_points, "lottery_prize", Some(&picked.id))
                    .await?;
            }
        }
        "gift" => {
            let id = crate::ids::next('k');
            let card_code = make_code();
            sqlx::query(
                "INSERT INTO gift_cards
                     (id, kind, code, title, theme, reward_points, assigned_user_id, created_by)
                 VALUES ($1,'gift',$2,$3,$4,$5,$6,NULL)",
            )
            .bind(&id)
            .bind(&card_code)
            .bind(&picked.gift_title)
            .bind(&picked.gift_theme)
            .bind(picked.points)
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
            card_id = Some(id);
            gift_points = picked.points as i64;
        }
        "custom" => {
            let title = if picked.custom_title.trim().is_empty() {
                picked.name.clone()
            } else {
                picked.custom_title.clone()
            };
            let id = crate::ids::next('k');
            let card_code = make_code();
            sqlx::query(
                "INSERT INTO gift_cards
                     (id, kind, code, title, note, theme, reward_points, reward_kind, reward_value,
                      reward_image, reward_desc, assigned_user_id, created_by)
                 VALUES ($1,'gift',$2,$3,$4,$5,0,'custom',$3,$6,$4,$7,NULL)",
            )
            .bind(&id)
            .bind(&card_code)
            .bind(&title)
            .bind(&picked.custom_desc)
            .bind(&picked.gift_theme)
            .bind(&picked.custom_image)
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
            card_id = Some(id);
        }
        _ => {}
    }

    sqlx::query(
        "INSERT INTO lottery_draws (id, user_id, prize_id, prize_name, cost)
         VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(crate::ids::next('w'))
    .bind(user_id)
    .bind(&picked.id)
    .bind(&picked.name)
    .bind(LOTTERY_COST as i32)
    .execute(&mut *tx)
    .await?;

    let balance: i32 = sqlx::query_scalar("SELECT points FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
    let balance = balance as i64;

    tx.commit().await?;

    Ok(DrawResult {
        prize_name: picked.name.clone(),
        kind: picked.kind.clone(),
        points: prize_points,
        gift_points,
        theme: picked.gift_theme.clone(),
        card_id,
        custom_title: picked.custom_title.clone(),
        custom_desc: picked.custom_desc.clone(),
        custom_image: picked.custom_image.clone(),
        balance,
    })
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DrawRow {
    pub prize_name: String,
    pub cost: i64,
    pub at: i64,
}

pub async fn my_draws(pool: &PgPool, user_id: &str) -> Result<Vec<DrawRow>, sqlx::Error> {
    let rows: Vec<(String, i32, DateTime<Utc>)> = sqlx::query_as(
        "SELECT prize_name, cost, created_at FROM lottery_draws
          WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(prize_name, cost, at)| DrawRow {
            prize_name,
            cost: cost as i64,
            at: at.timestamp_millis(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_is_ten_readable_chars() {
        for _ in 0..50 {
            let c = make_code();
            assert_eq!(c.len(), 10);
            assert!(c.chars().all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit()));
            assert!(!c.contains('0') && !c.contains('O') && !c.contains('1') && !c.contains('I'));
        }
    }
}
