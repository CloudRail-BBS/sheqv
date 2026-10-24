//! 积分与签到。
//!
//! 两条约束：
//! 1. **积分只有一个来源**：`point_logs`。`users.points` 是冗余余额，供排行榜与顶栏直接读，
//!    两者永远在同一事务里改；对不上时用 [`rebuild`] 按流水重算。
//! 2. **签到按上海时区的一天算**。用 `current_date` 会在 UTC 服务器上把 0–8 点的签到
//!    记到前一天，所以统一写 `(now() AT TIME ZONE 'Asia/Shanghai')::date`。

use chrono::NaiveDate;
use serde::Serialize;
use sqlx::PgPool;

/// 发一帖
pub const POST_REWARD: i64 = 5;
/// 发一条评论
pub const COMMENT_REWARD: i64 = 2;
/// 发布一个资源
pub const RESOURCE_REWARD: i64 = 20;
/// 签到基础分
pub const CHECKIN_BASE: i64 = 10;
/// 连签加成上限：第 n 天 +min(n-1, 7)，连签 8 天封顶 +7
pub const STREAK_BONUS_MAX: i64 = 7;

/// 与前端约定：这些 reason 会显示成中文
pub const REASON_LABELS: [(&str, &str); 8] = [
    ("post", "发帖"),
    ("comment", "评论"),
    ("checkin", "签到"),
    ("resource", "发布资源"),
    ("redeem", "兑换码"),
    ("gift", "礼品卡"),
    ("lottery", "抽奖消耗"),
    ("lottery_prize", "抽奖奖励"),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointLog {
    pub id: String,
    pub delta: i64,
    pub reason: String,
    pub at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankRow {
    pub rank: i64,
    pub user_id: String,
    pub nickname: String,
    pub points: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub points: i64,
    pub streak: i64,
    pub today_done: bool,
    /// 下一次签到能拿多少（今天已签则为明天）
    pub next_reward: i64,
    /// 今天签到拿到了多少；没签为 0
    pub today_earned: i64,
    pub log: Vec<PointLog>,
    pub rank: Vec<RankRow>,
    /// 我的名次；没分时为 0
    pub my_rank: i64,
    /// 最近 7 天是否签到（旧 → 新），用于日历点阵
    pub recent_days: Vec<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckinResult {
    /// 今天已经签过了（不算错误，方便前端提示）
    pub already: bool,
    pub earned: i64,
    pub points: i64,
    pub streak: i64,
    /// 签到后的余额在榜单上的名次
    pub my_rank: i64,
}

pub enum PointError {
    NotFound,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for PointError {
    fn from(e: sqlx::Error) -> Self {
        PointError::Db(e)
    }
}

/// 给某次行为记账。失败不该影响主流程（发帖成功但加分失败，比反过来好）。
pub async fn award(
    pool: &PgPool,
    user_id: &str,
    delta: i64,
    reason: &str,
    reference: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let balance = award_in(&mut tx, user_id, delta, reason, reference).await?;
    tx.commit().await?;
    Ok(balance)
}

/// 在调用方的事务里加分 / 扣分。
///
/// 礼品卡、抽奖、兑换码都要「发奖 + 改余额」原子完成，单独开事务会留下半截状态。
pub async fn award_in(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
    delta: i64,
    reason: &str,
    reference: Option<&str>,
) -> Result<i64, sqlx::Error> {
    sqlx::query(
        "INSERT INTO point_logs (id, user_id, delta, reason, ref) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(crate::ids::next('l'))
    .bind(user_id)
    .bind(delta as i32)
    .bind(reason)
    .bind(reference)
    .execute(&mut **tx)
    .await?;

    let balance: Option<i32> = sqlx::query_scalar(
        "UPDATE users SET points = GREATEST(0, points + $2) WHERE id = $1 RETURNING points",
    )
    .bind(user_id)
    .bind(delta as i32)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(balance.unwrap_or(0) as i64)
}

/// 顶栏用的轻量读数：只要余额与今天是否已签到。
///
/// 不要为了两个数字去跑整份 `snapshot`（流水 + 榜单 + 7 天点阵）。
pub async fn chip(pool: &PgPool, user_id: &str) -> Result<Option<(i64, bool)>, sqlx::Error> {
    let row: Option<(i32, bool)> = sqlx::query_as(
        "SELECT points,
                COALESCE(last_checkin = (now() AT TIME ZONE 'Asia/Shanghai')::date, false)
           FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(p, done)| (p as i64, done)))
}

/// 扣分。余额不足返回 `None`，不写流水也不改余额。
pub async fn spend(
    pool: &PgPool,
    user_id: &str,
    cost: i64,
    reason: &str,
    reference: Option<&str>,
) -> Result<Option<i64>, sqlx::Error> {
    if cost <= 0 {
        let balance: Option<i32> = sqlx::query_scalar("SELECT points FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
        return Ok(balance.map(|v| v as i64));
    }

    let mut tx = pool.begin().await?;
    let balance: Option<i32> = sqlx::query_scalar(
        "UPDATE users SET points = points - $2 WHERE id = $1 AND points >= $2 RETURNING points",
    )
    .bind(user_id)
    .bind(cost as i32)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(left) = balance else {
        tx.rollback().await?;
        return Ok(None);
    };

    sqlx::query(
        "INSERT INTO point_logs (id, user_id, delta, reason, ref) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(crate::ids::next('l'))
    .bind(user_id)
    .bind(-(cost as i32))
    .bind(reason)
    .bind(reference)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Some(left as i64))
}

/// 按流水重算余额与连签。给后台修数据用，也方便单测。
pub async fn rebuild(pool: &PgPool, user_id: &str) -> Result<i64, sqlx::Error> {
    let total: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(delta), 0)::bigint FROM point_logs WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    sqlx::query("UPDATE users SET points = GREATEST(0, $2) WHERE id = $1")
        .bind(user_id)
        .bind(total as i32)
        .execute(pool)
        .await?;
    Ok(total.max(0))
}

struct Me {
    points: i64,
    streak: i64,
    last: Option<NaiveDate>,
}

async fn load_me(pool: &PgPool, user_id: &str) -> Result<Me, PointError> {
    let row: Option<(i32, i32, Option<NaiveDate>)> =
        sqlx::query_as("SELECT points, checkin_streak, last_checkin FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
    let Some((points, streak, last)) = row else {
        return Err(PointError::NotFound);
    };
    Ok(Me {
        points: points as i64,
        streak: streak as i64,
        last,
    })
}

async fn today(pool: &PgPool) -> Result<NaiveDate, sqlx::Error> {
    sqlx::query_scalar("SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date")
        .fetch_one(pool)
        .await
}

/// 下一次签到能拿多少：连签第 n 天 = 基础分 + min(n-1, 上限)
pub fn reward_for(streak: i64) -> i64 {
    CHECKIN_BASE + (streak - 1).clamp(0, STREAK_BONUS_MAX)
}

pub async fn snapshot(pool: &PgPool, user_id: &str) -> Result<Snapshot, PointError> {
    let me = load_me(pool, user_id).await?;
    let today = today(pool).await?;
    let yesterday = today.pred_opt();
    let today_done = me.last == Some(today);

    // 今天签过 → 下一次是明天；昨天签过 → 今天还没签。两种都算「连得上」，连签 +1；
    // 既不是今天也不是昨天 → 断签，从 1 重新算。
    let continued = today_done || me.last == yesterday;
    let next_streak = if continued { me.streak + 1 } else { 1 };

    let logs: Vec<(String, i32, String, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, delta, reason, created_at FROM point_logs
          WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let today_earned: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(delta), 0)::bigint FROM point_logs
          WHERE user_id = $1 AND reason = 'checkin'
            AND (created_at AT TIME ZONE 'Asia/Shanghai')::date = $2",
    )
    .bind(user_id)
    .bind(today)
    .fetch_one(pool)
    .await?;

    let days: Vec<NaiveDate> = sqlx::query_scalar(
        "SELECT day FROM checkins WHERE user_id = $1 AND day > $2::date - 7 ORDER BY day",
    )
    .bind(user_id)
    .bind(today)
    .fetch_all(pool)
    .await?;
    let recent_days = (0..7)
        .map(|i| {
            let d = today - chrono::Days::new(6 - i);
            days.contains(&d)
        })
        .collect();

    let rank = rank_top(pool, 10).await?;
    let my_rank = my_rank(pool, user_id).await?;

    Ok(Snapshot {
        points: me.points,
        streak: me.streak,
        today_done,
        next_reward: reward_for(next_streak),
        today_earned,
        log: logs
            .into_iter()
            .map(|(id, delta, reason, at)| PointLog {
                id,
                delta: delta as i64,
                reason,
                at: at.timestamp_millis(),
            })
            .collect(),
        rank,
        my_rank,
        recent_days,
    })
}

/// 签到。行锁 + 主键双保险，并发点两次也只加一次分。
pub async fn checkin(pool: &PgPool, user_id: &str) -> Result<CheckinResult, PointError> {
    let mut tx = pool.begin().await?;

    let row: Option<(i32, i32, Option<NaiveDate>)> = sqlx::query_as(
        "SELECT points, checkin_streak, last_checkin FROM users WHERE id = $1 FOR UPDATE",
    )
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((points, streak, last)) = row else {
        return Err(PointError::NotFound);
    };

    let today: NaiveDate = sqlx::query_scalar("SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date")
        .fetch_one(&mut *tx)
        .await?;

    if last == Some(today) {
        let my_rank = my_rank_tx(&mut tx, user_id).await?;
        tx.rollback().await.ok();
        return Ok(CheckinResult {
            already: true,
            earned: 0,
            points: points as i64,
            streak: streak as i64,
            my_rank,
        });
    }

    let new_streak = if last == today.pred_opt() {
        streak + 1
    } else {
        1
    };
    let earned = reward_for(new_streak as i64);
    let balance = points as i64 + earned;

    sqlx::query(
        "UPDATE users SET points = $2, checkin_streak = $3, last_checkin = $4 WHERE id = $1",
    )
    .bind(user_id)
    .bind(balance as i32)
    .bind(new_streak)
    .bind(today)
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO checkins (user_id, day, points, streak) VALUES ($1, $2, $3, $4)")
        .bind(user_id)
        .bind(today)
        .bind(earned as i32)
        .bind(new_streak)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO point_logs (id, user_id, delta, reason, ref) VALUES ($1, $2, $3, 'checkin', $4)",
    )
    .bind(crate::ids::next('l'))
    .bind(user_id)
    .bind(earned as i32)
    .bind(today.format("%Y-%m-%d").to_string())
    .execute(&mut *tx)
    .await?;

    let my_rank = my_rank_tx(&mut tx, user_id).await?;
    tx.commit().await?;

    Ok(CheckinResult {
        already: false,
        earned,
        points: balance,
        streak: new_streak as i64,
        my_rank,
    })
}

async fn rank_top(pool: &PgPool, limit: i64) -> Result<Vec<RankRow>, sqlx::Error> {
    let rows: Vec<(String, String, i32)> = sqlx::query_as(
        "SELECT id, nickname, points FROM users
          WHERE points > 0 ORDER BY points DESC, created_at ASC LIMIT $1",
    )
    .bind(limit.clamp(1, 50))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, (user_id, nickname, points))| RankRow {
            rank: i as i64 + 1,
            user_id,
            nickname,
            points: points as i64,
        })
        .collect())
}

async fn my_rank(pool: &PgPool, user_id: &str) -> Result<i64, sqlx::Error> {
    // 0 分不上榜：否则空站里人人都是第 1 名
    sqlx::query_scalar(
        "SELECT CASE WHEN u.points <= 0 THEN 0
                     ELSE 1 + (SELECT count(*) FROM users u2 WHERE u2.points > u.points)
                END
           FROM users u WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map(|v: Option<i64>| v.unwrap_or(0))
}

async fn my_rank_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT CASE WHEN u.points <= 0 THEN 0
                     ELSE 1 + (SELECT count(*) FROM users u2 WHERE u2.points > u.points)
                END
           FROM users u WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await
    .map(|v: Option<i64>| v.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reward_grows_with_streak_then_caps() {
        assert_eq!(reward_for(1), CHECKIN_BASE);
        assert_eq!(reward_for(2), CHECKIN_BASE + 1);
        assert_eq!(reward_for(5), CHECKIN_BASE + 4);
        // 第 8 天到达上限，之后不再涨
        assert_eq!(reward_for(8), CHECKIN_BASE + STREAK_BONUS_MAX);
        assert_eq!(reward_for(30), CHECKIN_BASE + STREAK_BONUS_MAX);
    }

    #[test]
    fn reward_never_negative_on_weird_streak() {
        assert_eq!(reward_for(0), CHECKIN_BASE);
        assert_eq!(reward_for(-3), CHECKIN_BASE);
    }
}
