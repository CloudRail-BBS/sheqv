//! 徽章（自动达成，不需要人工发放）。
//!
//! 与「头衔」区分：头衔是身份标签（一人一个、可自定义），徽章是行为成就（一人多个、规则算出）。
//! 规则只依赖 users / posts / comments / sponsors 四张表，一次读库就能算出全站，
//! 所以列表页也能批量渲染，不需要给每个作者单独查询。

use std::collections::HashMap;

use chrono::Utc;
use serde::Serialize;
use sqlx::PgPool;

use crate::users::{PublicUser, UserRow};

#[derive(Debug, Clone, Serialize)]
pub struct Badge {
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    pub tone: &'static str,
}

/// 目录：新增徽章只改这里，展示与判定会自动跟上
pub const CATALOG: [Badge; 8] = [
    Badge {
        id: "founder",
        name: "创始成员",
        desc: "站内第一个注册账号",
        tone: "gold",
    },
    Badge {
        id: "admin",
        name: "管理员",
        desc: "拥有站点管理权限",
        tone: "blue",
    },
    Badge {
        id: "first-post",
        name: "初次发声",
        desc: "发布第一篇帖子",
        tone: "blue",
    },
    Badge {
        id: "writer",
        name: "笔耕不辍",
        desc: "累计发布 10 篇帖子",
        tone: "blue",
    },
    Badge {
        id: "talker",
        name: "热心回复",
        desc: "累计发表 20 条评论",
        tone: "blue",
    },
    Badge {
        id: "liked",
        name: "人气作者",
        desc: "帖子累计获得 50 个赞",
        tone: "blue",
    },
    Badge {
        id: "sponsor",
        name: "赞助者",
        desc: "出现在赞助名单中",
        tone: "blue",
    },
    Badge {
        id: "veteran",
        name: "元老",
        desc: "注册满 30 天",
        tone: "gray",
    },
];

#[derive(Debug, Serialize)]
pub struct BadgeItem {
    #[serde(flatten)]
    pub badge: Badge,
    pub earned: bool,
}

#[derive(Debug, Serialize)]
pub struct BadgeState {
    pub earned: Vec<Badge>,
    pub all: Vec<BadgeItem>,
}

fn badge(id: &str) -> Badge {
    CATALOG
        .iter()
        .find(|b| b.id == id)
        .cloned()
        .unwrap_or_else(|| CATALOG[0].clone())
}

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

struct Stats {
    posts: i64,
    comments: i64,
    likes: i64,
}

/// 全站一次读库，算出 `id:<uid>` 与 `name:<昵称>` 两种键（兼容早期只有昵称的数据）
pub async fn map(pool: &PgPool) -> Result<HashMap<String, Vec<Badge>>, sqlx::Error> {
    let users = crate::users::list(pool).await?;

    let post_rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT author_id, count(*)::bigint, COALESCE(sum(like_count), 0)::bigint
           FROM posts GROUP BY author_id",
    )
    .fetch_all(pool)
    .await?;

    let comment_rows: Vec<(String, i64)> =
        sqlx::query_as("SELECT author_id, count(*)::bigint FROM comments GROUP BY author_id")
            .fetch_all(pool)
            .await?;

    let sponsor_names: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sponsors WHERE NOT hidden")
            .fetch_all(pool)
            .await?;

    let mut stats: HashMap<String, Stats> = HashMap::new();
    for (uid, posts, likes) in post_rows {
        stats.insert(
            uid,
            Stats {
                posts,
                likes,
                comments: 0,
            },
        );
    }
    for (uid, comments) in comment_rows {
        stats
            .entry(uid)
            .or_insert(Stats {
                posts: 0,
                likes: 0,
                comments: 0,
            })
            .comments = comments;
    }

    let founder_id = users
        .iter()
        .min_by_key(|u| u.created_at)
        .map(|u| u.id.clone());
    let now = Utc::now().timestamp_millis();

    let mut out: HashMap<String, Vec<Badge>> = HashMap::new();
    for u in &users {
        let earned = badges_of(
            u,
            stats.get(&u.id),
            founder_id.as_deref(),
            &sponsor_names,
            now,
        );
        if earned.is_empty() {
            continue;
        }
        out.insert(format!("id:{}", u.id), earned.clone());
        out.insert(format!("name:{}", u.nickname), earned);
    }

    Ok(out)
}

fn badges_of(
    user: &UserRow,
    stats: Option<&Stats>,
    founder_id: Option<&str>,
    sponsor_names: &[String],
    now: i64,
) -> Vec<Badge> {
    let zero = Stats {
        posts: 0,
        likes: 0,
        comments: 0,
    };
    let s = stats.unwrap_or(&zero);
    let mut out = Vec::new();

    if founder_id == Some(user.id.as_str()) {
        out.push(badge("founder"));
    }
    if user.role == "admin" {
        out.push(badge("admin"));
    }
    if s.posts >= 1 {
        out.push(badge("first-post"));
    }
    if s.posts >= 10 {
        out.push(badge("writer"));
    }
    if s.comments >= 20 {
        out.push(badge("talker"));
    }
    if s.likes >= 50 {
        out.push(badge("liked"));
    }
    if sponsor_names.iter().any(|n| n == &user.nickname) {
        out.push(badge("sponsor"));
    }
    if now - user.created_at.timestamp_millis() >= 30 * DAY_MS {
        out.push(badge("veteran"));
    }

    out
}

/// 单个人的完整状态（个人主页的进度条用）
pub async fn state(pool: &PgPool, user: &PublicUser) -> Result<BadgeState, sqlx::Error> {
    let all = map(pool).await?;
    let earned = all
        .get(&format!("id:{}", user.id))
        .or_else(|| all.get(&format!("name:{}", user.nickname)))
        .cloned()
        .unwrap_or_default();

    let ids: Vec<&str> = earned.iter().map(|b| b.id).collect();
    Ok(BadgeState {
        all: CATALOG
            .iter()
            .cloned()
            .map(|b| BadgeItem {
                earned: ids.contains(&b.id),
                badge: b,
            })
            .collect(),
        earned,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_unique_and_known() {
        let ids: std::collections::HashSet<_> = CATALOG.iter().map(|b| b.id).collect();
        assert_eq!(ids.len(), CATALOG.len());
        assert_eq!(badge("admin").name, "管理员");
    }
}
