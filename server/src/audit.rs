//! 内容审核：**腾讯云内容安全（TMS）** 预审 + 人工复核。
//!
//! 三种策略（后台 `postAuditMode`）：
//! - `off`   直接发布（默认）
//! - `tms`   先过腾讯云文本内容安全：`Pass` 直接发布，`Review` / `Block` 进待审
//! - `all`   全部进待审队列，只由人工放行
//!
//! 旧的 `ai` 值仍认（历史数据），语义与 `tms` 相同。
//!
//! **调用失败一律进待审**，不放行——宁可多一条人工，也不要把可疑内容直接放出去。

use chrono::Utc;
use serde::Serialize;
use serde_json::{Map, Value, json};
use sqlx::PgPool;

use crate::ids;
use crate::settings;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Mode {
    Off,
    Smart,
    All,
}

pub fn mode(s: &Map<String, Value>) -> Mode {
    match settings::text(s, "postAuditMode").as_str() {
        // `ai` 是旧值，老库里可能还是它；语义已经换成腾讯云
        "tms" | "ai" => Mode::Smart,
        "all" => Mode::All,
        _ => Mode::Off,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub risky: bool,
    pub score: f32,
    pub labels: Vec<String>,
    pub reason: String,
}

/// 发帖前的判定结果：写库时用 status，AI 判过的话把 verdict 记进流水
pub struct Precheck {
    pub status: &'static str,
    pub verdict: Option<Verdict>,
}

pub async fn precheck(
    s: &Map<String, Value>,
    http: &reqwest::Client,
    title: &str,
    body: &str,
) -> Precheck {
    match mode(s) {
        Mode::Off => Precheck {
            status: "published",
            verdict: None,
        },
        Mode::All => Precheck {
            status: "pending",
            verdict: None,
        },
        Mode::Smart => {
            let Some(cfg) = crate::tms::config(s) else {
                // 开了智能审核却没配密钥：保守进待审，别静默放行
                tracing::warn!("postAuditMode=tms 但未配置腾讯云密钥，全部转入人工审核");
                return Precheck {
                    status: "pending",
                    verdict: None,
                };
            };
            match crate::tms::moderate(http, &cfg, title, body).await {
                Ok(None) => Precheck {
                    status: "published",
                    verdict: Some(Verdict {
                        risky: false,
                        score: 0.0,
                        labels: vec![],
                        reason: "腾讯云：Normal".into(),
                    }),
                },
                Ok(Some(reason)) => Precheck {
                    status: "pending",
                    verdict: Some(Verdict {
                        risky: true,
                        score: 1.0,
                        labels: vec!["tms".into()],
                        reason,
                    }),
                },
                Err(err) => {
                    tracing::warn!(error = %err, "腾讯云内容安全调用失败，转入人工");
                    Precheck {
                        status: "pending",
                        verdict: None,
                    }
                }
            }
        }
    }
}

pub struct NewLog<'a> {
    pub target_type: &'a str,
    pub target_id: &'a str,
    /// approve / reject / pending
    pub decision: &'a str,
    /// ai / human / system
    pub source: &'a str,
    pub actor_id: Option<&'a str>,
    pub reason: Option<&'a str>,
    pub score: Option<f32>,
    pub labels: Vec<String>,
}

pub async fn record(pool: &PgPool, log: NewLog<'_>) -> Result<(), sqlx::Error> {
    let id = ids::next('l');
    sqlx::query(
        "INSERT INTO audit_logs
            (id, target_type, target_id, decision, source, actor_id, reason, score, labels, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())",
    )
    .bind(&id)
    .bind(log.target_type)
    .bind(log.target_id)
    .bind(log.decision)
    .bind(log.source)
    .bind(log.actor_id)
    .bind(log.reason)
    .bind(log.score)
    .bind(json!(log.labels))
    .execute(pool)
    .await?;
    Ok(())
}

/// 人工复核：approve → 发布，reject → 拒绝并记原因
pub async fn review_post(
    pool: &PgPool,
    post_id: &str,
    approve: bool,
    actor_id: &str,
    reason: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let status = if approve { "published" } else { "rejected" };
    let reason = reason.map(str::trim).filter(|r| !r.is_empty());

    let affected = sqlx::query(
        "UPDATE posts
            SET status = $2, reject_reason = $3, reviewed_at = now()
          WHERE id = $1",
    )
    .bind(post_id)
    .bind(status)
    .bind(reason)
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Ok(false);
    }

    record(
        pool,
        NewLog {
            target_type: "post",
            target_id: post_id,
            decision: if approve { "approve" } else { "reject" },
            source: "human",
            actor_id: Some(actor_id),
            reason,
            score: None,
            labels: Vec::new(),
        },
    )
    .await?;

    Ok(true)
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PendingPost {
    pub id: String,
    pub title: Option<String>,
    pub body: String,
    pub author: String,
    pub author_id: String,
    pub status: String,
    pub reject_reason: Option<String>,
    pub created_at: i64,
    /// 最近一次 AI 判定的说明（没有就是 None）
    pub ai_reason: Option<String>,
    pub ai_score: Option<f32>,
    pub ai_labels: Option<Value>,
}

pub async fn pending(pool: &PgPool, limit: i64) -> Result<Vec<PendingPost>, sqlx::Error> {
    sqlx::query_as(
        "SELECT p.id, p.title, p.body, u.nickname AS author, p.author_id,
                p.status, p.reject_reason,
                (extract(epoch FROM p.created_at) * 1000)::bigint AS created_at,
                l.reason AS ai_reason, l.score AS ai_score, l.labels AS ai_labels
           FROM posts p
           JOIN users u ON u.id = p.author_id
           LEFT JOIN LATERAL (
                SELECT reason, score, labels
                  FROM audit_logs
                 WHERE target_type = 'post' AND target_id = p.id AND source = 'ai'
                 ORDER BY created_at DESC LIMIT 1
           ) l ON true
          WHERE p.status = 'pending'
          ORDER BY p.created_at ASC
          LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
}

pub async fn counts(pool: &PgPool) -> Result<(i64, i64), sqlx::Error> {
    let row: (i64, i64) = sqlx::query_as(
        "SELECT count(*) FILTER (WHERE status = 'pending'),
                count(*) FILTER (WHERE status = 'rejected')
           FROM posts",
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// 记录 AI 判定（发帖成功后调用，target_id 此时才存在）
pub async fn record_ai(pool: &PgPool, post_id: &str, v: &Verdict) {
    let _ = record(
        pool,
        NewLog {
            target_type: "post",
            target_id: post_id,
            decision: if v.risky { "pending" } else { "approve" },
            source: "ai",
            actor_id: None,
            reason: Some(v.reason.as_str()),
            score: Some(v.score),
            labels: v.labels.clone(),
        },
    )
    .await;
}

/// 当前时间戳（毫秒），给前端排序用
pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_parsing() {
        let mut m = Map::new();
        // 旧值 ai 与新的 tms 都按智能审核处理
        m.insert("postAuditMode".into(), Value::String("ai".into()));
        assert_eq!(mode(&m), Mode::Smart);
        m.insert("postAuditMode".into(), Value::String("tms".into()));
        assert_eq!(mode(&m), Mode::Smart);
        m.insert("postAuditMode".into(), Value::String("all".into()));
        assert_eq!(mode(&m), Mode::All);
        m.insert("postAuditMode".into(), Value::String("off".into()));
        assert_eq!(mode(&m), Mode::Off);
        m.insert("postAuditMode".into(), Value::String("oops".into()));
        assert_eq!(mode(&m), Mode::Off);
    }
}
