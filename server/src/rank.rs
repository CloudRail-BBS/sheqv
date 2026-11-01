//! 等级与信誉：**都是算出来的，不额外存表**。
//!
//! - 等级看**累计获得**积分（不是余额）：花掉的、被扣掉的都不降级，
//!   但删帖 / 删评论 / 删资源的冲正会扣回去，避免「发一篇删一篇」刷等级；
//!   曲线是 `100 × (L-1)²`，避免早期几百分就冲到满级；
//! - 信誉**初始 100**：只因为「被拒内容 / 封禁」自动扣分，管理员还能在后台手动扣分（或恢复），
//!   扣分记录落在 `reputation_adjustments`，总分 = 100 − 自动扣分 + 人工调整，实时算不落表。

use serde::Serialize;
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelInfo {
    pub level: i64,
    pub title: String,
    /// 累计获得的积分（决定等级的那个数，不是余额）
    pub exp: i64,
    /// 本级起点（含）
    pub floor: i64,
    /// 下一级门槛；满级时等于当前积分
    pub next_at: i64,
    /// 0–100 的本级进度
    pub progress: i64,
}

const TITLES: [&str; 7] = [
    "新面孔", "常客", "熟面孔", "老玩家", "社区骨干", "资深玩家", "社区元老",
];

/// 升到 `level` 需要的累计积分
fn threshold(level: i64) -> i64 {
    if level <= 1 {
        return 0;
    }
    100 * (level - 1) * (level - 1)
}

pub fn level_of(points: i64) -> LevelInfo {
    let exp = points.max(0);
    let mut level = 1i64;
    while level < 99 && exp >= threshold(level + 1) {
        level += 1;
    }

    let floor = threshold(level);
    let next_at = if level >= 99 { exp } else { threshold(level + 1) };
    let span = (next_at - floor).max(1);
    let progress = (((exp - floor) as f64 / span as f64) * 100.0).round().clamp(0.0, 100.0) as i64;

    let title = TITLES
        .get((level as usize).saturating_sub(1).min(TITLES.len() - 1))
        .copied()
        .unwrap_or("社区元老");

    LevelInfo {
        level,
        title: title.to_string(),
        exp,
        floor,
        next_at,
        progress,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reputation {
    pub score: i64,
    /// 优秀 / 良好 / 正常 / 待观察 / 受限
    pub tier: String,
    /// 一句话解释，悬停或详情页展示
    pub hint: String,
}

pub struct Signals {
    /// 被拒内容数量（自动扣分）
    pub rejected: i64,
    /// 管理员人工调整的累计值（可为负）
    pub adjust: i64,
    pub banned: bool,
}

pub fn reputation(s: &Signals) -> Reputation {
    if s.banned {
        return Reputation {
            score: 0,
            tier: "受限".into(),
            hint: "账号已被封禁".into(),
        };
    }

    // 初始 100；自动扣分只看被拒内容，其余都由管理员手动调整
    let auto_deduct = (s.rejected * 6).clamp(0, 30);
    let score = (100 - auto_deduct + s.adjust).clamp(0, 100);

    let tier = match score {
        s if s >= 85 => "优秀",
        s if s >= 70 => "良好",
        s if s >= 50 => "正常",
        s if s >= 30 => "待观察",
        _ => "受限",
    };

    // 说明优先讲「为什么被扣」，没有扣分就直说初始分
    let mut reasons: Vec<String> = Vec::new();
    if s.rejected > 0 {
        reasons.push(format!("{} 篇内容被拒 −{}", s.rejected, auto_deduct));
    }
    if s.adjust < 0 {
        reasons.push(format!("管理员扣除 {} 分", -s.adjust));
    } else if s.adjust > 0 {
        reasons.push(format!("管理员补回 {} 分", s.adjust));
    }
    let hint = if reasons.is_empty() {
        "初始 100 分，暂无扣分".to_string()
    } else {
        reasons.join(" · ")
    };

    Reputation {
        score,
        tier: tier.into(),
        hint,
    }
}

/// 一条人工调整记录
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Adjustment {
    pub id: String,
    pub delta: i64,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operator: Option<String>,
    pub created_at: i64,
}

/// 从库里取信号并算信誉（公开资料页与会话状态共用）
pub async fn reputation_of(pool: &PgPool, user_id: &str) -> Result<Reputation, sqlx::Error> {
    let row: Option<(i64, i64, bool)> = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM posts WHERE author_id = $1 AND status = 'rejected')::bigint,
            COALESCE((SELECT sum(delta) FROM reputation_adjustments WHERE user_id = $1), 0)::bigint,
            u.banned
           FROM users u WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some((rejected, adjust, banned)) = row else {
        return Ok(Reputation {
            score: 0,
            tier: "受限".into(),
            hint: "账号不存在".into(),
        });
    };

    Ok(reputation(&Signals {
        rejected,
        adjust,
        banned,
    }))
}

/// 最近的人工调整记录（后台用）
pub async fn adjustments(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<Adjustment>, sqlx::Error> {
    let rows: Vec<(String, i32, String, Option<String>, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            "SELECT a.id, a.delta, a.reason, u.nickname, a.created_at
               FROM reputation_adjustments a
               LEFT JOIN users u ON u.id = a.created_by
              WHERE a.user_id = $1
              ORDER BY a.created_at DESC
              LIMIT 30",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|(id, delta, reason, operator, created_at)| Adjustment {
            id,
            delta: delta as i64,
            reason,
            operator,
            created_at: created_at.timestamp_millis(),
        })
        .collect())
}

/// 记一笔人工调整，返回调整后的信誉
pub async fn adjust(
    pool: &PgPool,
    user_id: &str,
    delta: i64,
    reason: &str,
    operator: Option<&str>,
) -> Result<Reputation, sqlx::Error> {
    sqlx::query(
        "INSERT INTO reputation_adjustments (id, user_id, delta, reason, created_by)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(crate::ids::next('p'))
    .bind(user_id)
    .bind(delta as i32)
    .bind(reason)
    .bind(operator)
    .execute(pool)
    .await?;

    reputation_of(pool, user_id).await
}

pub async fn points_of(pool: &PgPool, user_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT points::bigint FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map(|v: Option<i64>| v.unwrap_or(0))
}

/// 累计获得积分：等级用的就是这个数。
///
/// - 只算正数流水，抽奖 / 抽卡 / 兑换 / 礼品卡的消耗不会让等级往回掉；
/// - 但删帖、删评论、删资源的冲正（`*_revoke`，负数）要算进去，
///   否则「发一篇删一篇」可以反复刷分刷等级；
/// - 管理员手动扣分不算（那是惩罚，不夺走已经拿到的等级）。
pub async fn earned_of(pool: &PgPool, user_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(delta), 0)::bigint
           FROM point_logs
          WHERE user_id = $1
            AND (delta > 0
                 OR reason IN ('post_revoke', 'comment_revoke', 'resource_revoke'))",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map(|v: Option<i64>| v.unwrap_or(0))
}
