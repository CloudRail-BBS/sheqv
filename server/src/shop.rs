//! 积分商城：明码标价，直接兑换。
//!
//! 和抽奖 / 抽卡的区别是「确定性」——这边付多少积分换什么写得很清楚，
//! 所以库存与余额必须在同一个事务里扣，任何一步失败都不能留下半截订单。

use serde::Serialize;
use sqlx::PgPool;

use crate::ids;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub name: String,
    pub descr: String,
    pub image: String,
    pub price: i32,
    /// -1 表示不限量
    pub stock: i32,
    pub active: bool,
    pub sort: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    pub item_name: String,
    pub price: i64,
    pub created_at: i64,
}

const COLS: &str = "id, name, descr, image, price, stock, active, sort";

pub async fn list(pool: &PgPool) -> Result<Vec<Item>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLS} FROM shop_items WHERE active ORDER BY sort ASC, created_at DESC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn admin_list(pool: &PgPool) -> Result<Vec<Item>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLS} FROM shop_items ORDER BY active DESC, sort ASC, created_at DESC"
    ))
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &PgPool, id: &str) -> Result<Option<Item>, sqlx::Error> {
    sqlx::query_as(&format!("SELECT {COLS} FROM shop_items WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn my_orders(pool: &PgPool, user_id: &str, limit: i64) -> Result<Vec<Order>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, item_name, price::bigint AS price,
                (extract(epoch from created_at) * 1000)::bigint AS created_at
           FROM shop_orders WHERE user_id = $1
          ORDER BY created_at DESC LIMIT $2",
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await
}

pub struct NewItem<'a> {
    pub name: &'a str,
    pub descr: &'a str,
    pub image: &'a str,
    pub price: i64,
    pub stock: i64,
    pub active: bool,
    pub sort: i64,
}

pub async fn create(pool: &PgPool, input: &NewItem<'_>) -> Result<String, sqlx::Error> {
    let id = ids::next('s');
    sqlx::query(
        "INSERT INTO shop_items (id, name, descr, image, price, stock, active, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(input.descr.trim())
    .bind(input.image.trim())
    .bind(input.price.clamp(1, 1_000_000) as i32)
    .bind(input.stock.clamp(-1, 999_999) as i32)
    .bind(input.active)
    .bind(input.sort as i32)
    .execute(pool)
    .await?;
    Ok(id)
}

pub struct PatchItem<'a> {
    pub name: Option<&'a str>,
    pub descr: Option<&'a str>,
    pub image: Option<&'a str>,
    pub price: Option<i64>,
    pub stock: Option<i64>,
    pub active: Option<bool>,
    pub sort: Option<i64>,
}

pub async fn patch(pool: &PgPool, id: &str, p: &PatchItem<'_>) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE shop_items SET
            name   = COALESCE($2, name),
            descr  = COALESCE($3, descr),
            image  = COALESCE($4, image),
            price  = COALESCE($5, price),
            stock  = COALESCE($6, stock),
            active = COALESCE($7, active),
            sort   = COALESCE($8, sort)
          WHERE id = $1",
    )
    .bind(id)
    .bind(p.name.map(str::trim))
    .bind(p.descr.map(str::trim))
    .bind(p.image.map(str::trim))
    .bind(p.price.map(|v| v.clamp(1, 1_000_000) as i32))
    .bind(p.stock.map(|v| v.clamp(-1, 999_999) as i32))
    .bind(p.active)
    .bind(p.sort.map(|v| v as i32))
    .execute(pool)
    .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM shop_items WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

pub enum BuyError {
    NotFound,
    SoldOut,
    NotEnough,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for BuyError {
    fn from(e: sqlx::Error) -> Self {
        BuyError::Db(e)
    }
}

/// 兑换：行锁商品 → 扣积分 → 扣库存 → 记流水与订单，全部在一个事务里。
///
/// 返回 (兑换后的余额, 商品名)。积分不够不会写任何记录。
pub async fn redeem(pool: &PgPool, user_id: &str, item_id: &str) -> Result<(i64, String), BuyError> {
    let mut tx = pool.begin().await?;

    let item: Option<Item> = sqlx::query_as(&format!(
        "SELECT {COLS} FROM shop_items WHERE id = $1 AND active FOR UPDATE"
    ))
    .bind(item_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(item) = item else {
        tx.rollback().await?;
        return Err(BuyError::NotFound);
    };

    if item.stock == 0 {
        tx.rollback().await?;
        return Err(BuyError::SoldOut);
    }

    let balance: Option<i32> = sqlx::query_scalar(
        "UPDATE users SET points = points - $2 WHERE id = $1 AND points >= $2 RETURNING points",
    )
    .bind(user_id)
    .bind(item.price)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(balance) = balance else {
        tx.rollback().await?;
        return Err(BuyError::NotEnough);
    };

    if item.stock > 0 {
        let left: Option<i32> =
            sqlx::query_scalar("UPDATE shop_items SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock")
                .bind(&item.id)
                .fetch_optional(&mut *tx)
                .await?;
        if left.is_none() {
            tx.rollback().await?;
            return Err(BuyError::SoldOut);
        }
    }

    let order_id = ids::next('o');
    sqlx::query(
        "INSERT INTO point_logs (id, user_id, delta, reason, ref) VALUES ($1, $2, $3, 'shop', $4)",
    )
    .bind(ids::next('l'))
    .bind(user_id)
    .bind(-item.price)
    .bind(&order_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO shop_orders (id, user_id, item_id, item_name, price)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&order_id)
    .bind(user_id)
    .bind(&item.id)
    .bind(&item.name)
    .bind(item.price)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok((balance as i64, item.name))
}
