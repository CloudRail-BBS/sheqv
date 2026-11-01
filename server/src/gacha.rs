//! 抽卡：卡池由后台维护，用户花积分抽一张。
//!
//! 三条规则：
//! 1. 抽卡要**扣积分 + 扣库存 + 记录**，三件事在同一个事务里，任何一步失败都回滚；
//! 2. 权重是「越大越常见」，只在 `active` 且还有库存的卡里抽；
//! 3. 记录里存卡名与稀有度的快照，卡以后被删了，图鉴与历史仍然能显示。
//!
//! 卡面有两种画法：默认是「符号 + 主色」，后台也可以传一张图（`image`），有图优先用图。

use chrono::{DateTime, Utc};
use rand::Rng;
use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

pub const RARITIES: [&str; 4] = ["common", "rare", "epic", "legend"];

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub name: String,
    pub rarity: String,
    pub weight: i32,
    pub emoji: String,
    /// 卡面插图；空串表示用 emoji
    pub image: String,
    pub color: String,
    pub descr: String,
    pub stock: i32,
    pub active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawView {
    pub id: String,
    pub card_name: String,
    pub rarity: String,
    pub cost: i64,
    pub created_at: i64,
}

const COLS: &str = "id, name, rarity, weight, emoji, image, color, descr, stock, active";

/// 稀有度从高到低，再按权重从小到大（越稀有越靠前）
const ORDER: &str = "ORDER BY CASE rarity WHEN 'legend' THEN 0 WHEN 'epic' THEN 1
                     WHEN 'rare' THEN 2 ELSE 3 END, weight ASC";

/// 公开卡池：只出上架且有库存的卡，按稀有度排
pub async fn pool(pool: &PgPool) -> Result<Vec<Card>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLS} FROM gacha_cards WHERE active AND (stock < 0 OR stock > 0) {ORDER}"
    ))
    .fetch_all(pool)
    .await
}

/// 后台列表：含下架与售罄的卡
pub async fn admin_list(pool: &PgPool) -> Result<Vec<Card>, sqlx::Error> {
    sqlx::query_as(&format!("SELECT {COLS} FROM gacha_cards {ORDER}"))
        .fetch_all(pool)
        .await
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Card>, sqlx::Error> {
    sqlx::query_as(&format!("SELECT {COLS} FROM gacha_cards WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub struct NewCard<'a> {
    pub name: &'a str,
    pub rarity: &'a str,
    pub weight: i32,
    pub emoji: &'a str,
    pub image: &'a str,
    pub color: &'a str,
    pub descr: &'a str,
    pub stock: i32,
    pub active: bool,
}

pub async fn create(pool: &PgPool, c: &NewCard<'_>) -> Result<Card, sqlx::Error> {
    let id = ids::next('g');
    sqlx::query(
        "INSERT INTO gacha_cards (id, name, rarity, weight, emoji, image, color, descr, stock, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(&id)
    .bind(c.name)
    .bind(c.rarity)
    .bind(c.weight)
    .bind(c.emoji)
    .bind(c.image)
    .bind(c.color)
    .bind(c.descr)
    .bind(c.stock)
    .bind(c.active)
    .execute(pool)
    .await?;

    get(pool, &id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub struct PatchCard<'a> {
    pub name: Option<&'a str>,
    pub rarity: Option<&'a str>,
    pub weight: Option<i32>,
    pub emoji: Option<&'a str>,
    pub image: Option<&'a str>,
    pub color: Option<&'a str>,
    pub descr: Option<&'a str>,
    pub stock: Option<i32>,
    pub active: Option<bool>,
}

pub async fn patch(pool: &PgPool, id: &str, c: &PatchCard<'_>) -> Result<Option<Card>, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE gacha_cards SET
             name   = COALESCE($2, name),
             rarity = COALESCE($3, rarity),
             weight = COALESCE($4, weight),
             emoji  = COALESCE($5, emoji),
             image  = COALESCE($6, image),
             color  = COALESCE($7, color),
             descr  = COALESCE($8, descr),
             stock  = COALESCE($9, stock),
             active = COALESCE($10, active)
           WHERE id = $1",
    )
    .bind(id)
    .bind(c.name)
    .bind(c.rarity)
    .bind(c.weight)
    .bind(c.emoji)
    .bind(c.image)
    .bind(c.color)
    .bind(c.descr)
    .bind(c.stock)
    .bind(c.active)
    .execute(pool)
    .await?;

    if done.rows_affected() == 0 {
        return Ok(None);
    }
    get(pool, id).await
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM gacha_cards WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 我的抽卡记录（最近的在前）
pub async fn my_draws(
    pool: &PgPool,
    user_id: &str,
    limit: i64,
) -> Result<Vec<DrawView>, sqlx::Error> {
    let rows: Vec<(String, String, String, i32, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, card_name, rarity, cost, created_at
           FROM gacha_draws WHERE user_id = $1
          ORDER BY created_at DESC LIMIT $2",
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, card_name, rarity, cost, created_at)| DrawView {
            id,
            card_name,
            rarity,
            cost: cost as i64,
            created_at: created_at.timestamp_millis(),
        })
        .collect())
}

/// 图鉴：卡片 id → 抽到次数
pub async fn owned(pool: &PgPool, user_id: &str) -> Result<Vec<(String, i64)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT card_id, count(*)::bigint FROM gacha_draws
          WHERE user_id = $1 AND card_id IS NOT NULL
          GROUP BY card_id",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub enum DrawResult {
    Ok { card: Card, balance: i64 },
    /// 积分不够
    NotEnough { balance: i64 },
    /// 卡池空了 / 全部售罄
    Empty,
}

/// 抽一张：扣积分 → 按权重选卡 → 扣库存 → 记一笔，全在一个事务里。
pub async fn draw(pool: &PgPool, user_id: &str, cost: i64) -> Result<DrawResult, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // 1. 先扣积分（并发下用条件更新，扣不动就是余额不足）
    let balance: Option<i32> = sqlx::query_scalar(
        "UPDATE users SET points = points - $2 WHERE id = $1 AND points >= $2 RETURNING points",
    )
    .bind(user_id)
    .bind(cost as i32)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(balance) = balance else {
        tx.rollback().await?;
        let left: Option<i32> = sqlx::query_scalar("SELECT points FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
        return Ok(DrawResult::NotEnough {
            balance: left.unwrap_or(0) as i64,
        });
    };

    // 2. 候选卡加行锁，避免两个请求同时抽走最后一张限量卡
    let cards: Vec<Card> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM gacha_cards
          WHERE active AND (stock < 0 OR stock > 0)
          {ORDER}
          FOR UPDATE"
    ))
    .fetch_all(&mut *tx)
    .await?;

    if cards.is_empty() {
        tx.rollback().await?;
        return Ok(DrawResult::Empty);
    }

    // 3. 加权随机：权重大 = 更常见
    let total: i64 = cards.iter().map(|c| c.weight.max(1) as i64).sum();
    let mut roll = rand::rng().random_range(0..total.max(1));
    let mut picked = cards.last().cloned().expect("cards 非空");
    for card in &cards {
        roll -= card.weight.max(1) as i64;
        if roll < 0 {
            picked = card.clone();
            break;
        }
    }

    // 4. 限量卡扣库存
    if picked.stock > 0 {
        sqlx::query("UPDATE gacha_cards SET stock = stock - 1 WHERE id = $1")
            .bind(&picked.id)
            .execute(&mut *tx)
            .await?;
        picked.stock -= 1;
    }

    // 5. 积分流水 + 抽卡记录
    let draw_id = ids::next('g');
    sqlx::query(
        "INSERT INTO point_logs (id, user_id, delta, reason, ref)
         VALUES ($1, $2, $3, 'gacha', $4)",
    )
    .bind(ids::next('l'))
    .bind(user_id)
    .bind(-(cost as i32))
    .bind(&draw_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO gacha_draws (id, user_id, card_id, card_name, rarity, cost)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&draw_id)
    .bind(user_id)
    .bind(&picked.id)
    .bind(&picked.name)
    .bind(&picked.rarity)
    .bind(cost as i32)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(DrawResult::Ok {
        card: picked,
        balance: balance as i64,
    })
}
