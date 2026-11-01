//! 等级与信誉：**都是算出来的，不额外存表**。
//!
//! - 等级只看积分（`users.points`），曲线是 `100 × (L-1)²`，避免早期几百分就冲到满级；
//! - 信誉是 0–100 的综合分：账号年龄、发帖评论量、认证、被拒内容与封禁状态各自加减，
//!   每次读取时按当时的库内数据实时算，不需要定时任务，也不会和历史值打架。

use serde::Serialize;
use sqlx::PgPool;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelInfo {
    pub level: i64,
    pub title: String,
    /// 当前积分
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
    pub age_days: i64,
    pub posts: i64,
    pub comments: i64,
    pub rejected: i64,
    pub verified: bool,
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

    let mut score: i64 = 60;

    // 账号年龄：每天 0.2 分，最多 +10（≈50 天封顶）
    score += (s.age_days.clamp(0, 50) as f64 * 0.2) as i64;
    // 发帖：每 2 帖 +1，最多 +10
    score += (s.posts / 2).clamp(0, 10);
    // 评论：每 10 条 +1，最多 +8
    score += (s.comments / 10).clamp(0, 8);
    // 认证：+8
    if s.verified {
        score += 8;
    }
    // 被拒内容：每篇 -6，最多 -30
    score -= (s.rejected * 6).clamp(0, 30);

    let score = score.clamp(0, 100);
    let (tier, hint) = match score {
        s if s >= 85 => ("优秀", "长期活跃、内容稳定，社区里可以信任的成员"),
        s if s >= 70 => ("良好", "参与度不错，没有明显的违规记录"),
        s if s >= 50 => ("正常", "正常的社区成员"),
        s if s >= 30 => ("待观察", "有过被拒内容或活跃度极低，多发点有用的内容会回升"),
        _ => ("受限", "违规记录较多，建议先熟悉社区公约"),
    };

    Reputation {
        score,
        tier: tier.into(),
        hint: hint.into(),
    }
}

/// 从库里取信号并算信誉（公开资料页与会话状态共用）
pub async fn reputation_of(pool: &PgPool, user_id: &str) -> Result<Reputation, sqlx::Error> {
    let row: Option<(i64, i64, i64, String, bool, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT
            (SELECT count(*) FROM posts WHERE author_id = $1 AND status = 'published')::bigint,
            (SELECT count(*) FROM comments WHERE author_id = $1)::bigint,
            (SELECT count(*) FROM posts WHERE author_id = $1 AND status = 'rejected')::bigint,
            u.verify_kind,
            u.banned,
            u.created_at
           FROM users u WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some((posts, comments, rejected, verify_kind, banned, created_at)) = row else {
        return Ok(Reputation {
            score: 0,
            tier: "受限".into(),
            hint: "账号不存在".into(),
        });
    };

    let age_days = (chrono::Utc::now() - created_at).num_days().max(0);
    Ok(reputation(&Signals {
        age_days,
        posts,
        comments,
        rejected,
        verified: !verify_kind.is_empty(),
        banned,
    }))
}

pub async fn points_of(pool: &PgPool, user_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT points::bigint FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map(|v: Option<i64>| v.unwrap_or(0))
}
