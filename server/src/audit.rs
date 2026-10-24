//! 内容审核：AI 预审 + 人工复核。
//!
//! 三种策略（后台 `postAuditMode`）：
//! - `off`  直接发布（默认，保持原行为）
//! - `ai`   先过 AI：判定风险或调用失败 → 进待审队列；通过则直接发布
//! - `all`  全部进待审队列，只由人工放行
//!
//! **AI 调用失败一律进待审**，不放行——宁可多一条人工，也不要把可疑内容直接放出去。

use std::time::Duration;

use chrono::Utc;
use serde::Serialize;
use serde_json::{Map, Value, json};
use sqlx::PgPool;

use crate::ids;
use crate::settings;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Mode {
    Off,
    Ai,
    All,
}

pub fn mode(s: &Map<String, Value>) -> Mode {
    match settings::text(s, "postAuditMode").as_str() {
        "ai" => Mode::Ai,
        "all" => Mode::All,
        _ => Mode::Off,
    }
}

#[derive(Debug, Clone)]
pub struct AiConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
}

const DEFAULT_PROMPT: &str = "你是中文社区的内容审核员。判断用户帖子是否违反以下规则：\
涉及色情、暴力威胁、仇恨歧视、违法犯罪交易、恶意广告与刷屏、泄露他人隐私。\
只输出 JSON，不要解释，格式：\
{\"risky\": true 或 false, \"score\": 0 到 1 的小数, \"labels\": [\"spam\"], \"reason\": \"不超过 40 字的中文说明\"}";

pub fn ai_config(s: &Map<String, Value>) -> Option<AiConfig> {
    let base_url = settings::text(s, "aiBaseUrl").trim().to_string();
    let api_key = settings::text(s, "aiApiKey").trim().to_string();
    if base_url.is_empty() || api_key.is_empty() {
        return None;
    }
    let prompt = {
        let p = settings::text(s, "aiPrompt").trim().to_string();
        if p.is_empty() {
            DEFAULT_PROMPT.to_string()
        } else {
            p
        }
    };
    Some(AiConfig {
        base_url: base_url.trim_end_matches('/').to_string(),
        api_key,
        model: {
            let m = settings::text(s, "aiModel").trim().to_string();
            if m.is_empty() {
                "gpt-4o-mini".to_string()
            } else {
                m
            }
        },
        prompt,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub risky: bool,
    pub score: f32,
    pub labels: Vec<String>,
    pub reason: String,
}

/// 从模型回复里抠出 JSON（有些模型会包一层 ```json 或前后加解释）
fn extract_json(raw: &str) -> Option<Value> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str(&raw[start..=end]).ok()
}

/// 调一次 OpenAI 兼容的 `/chat/completions`
pub async fn ai_review(
    http: &reqwest::Client,
    cfg: &AiConfig,
    title: &str,
    body: &str,
) -> Result<Verdict, String> {
    let url = format!("{}/chat/completions", cfg.base_url);
    let content = format!("标题：{title}\n正文：{body}");

    let resp = http
        .post(&url)
        .bearer_auth(&cfg.api_key)
        .timeout(Duration::from_secs(25))
        .json(&json!({
            "model": cfg.model,
            "temperature": 0,
            "messages": [
                { "role": "system", "content": cfg.prompt },
                { "role": "user", "content": content }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败：{e}"))?;
    if !status.is_success() {
        return Err(format!(
            "上游返回 {status}：{}",
            text.chars().take(200).collect::<String>()
        ));
    }

    let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("响应不是 JSON：{e}"))?;
    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| "响应里没有 choices[0].message.content".to_string())?;

    let obj = extract_json(content).ok_or_else(|| format!("模型输出不是 JSON：{content}"))?;

    Ok(Verdict {
        risky: obj["risky"].as_bool().unwrap_or(false),
        score: obj["score"].as_f64().unwrap_or(0.0) as f32,
        labels: obj["labels"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        reason: obj["reason"].as_str().unwrap_or("").to_string(),
    })
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
        Mode::Ai => {
            let Some(cfg) = ai_config(s) else {
                // 开了 AI 审核却没配凭证：保守进待审，别静默放行
                tracing::warn!("postAuditMode=ai 但未配置 aiBaseUrl / aiApiKey，全部转入人工审核");
                return Precheck {
                    status: "pending",
                    verdict: None,
                };
            };
            match ai_review(http, &cfg, title, body).await {
                Ok(v) => Precheck {
                    status: if v.risky { "pending" } else { "published" },
                    verdict: Some(v),
                },
                Err(err) => {
                    tracing::warn!(error = %err, "AI 审核失败，转入人工");
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
    fn json_can_be_wrapped() {
        let raw = "好的：\n```json\n{\"risky\": true, \"score\": 0.8, \"labels\": [\"spam\"], \"reason\": \"广告\"}\n```";
        let v = extract_json(raw).expect("应能抠出 JSON");
        assert_eq!(v["risky"], true);
        assert_eq!(v["labels"][0], "spam");
    }

    #[test]
    fn non_json_returns_none() {
        assert!(extract_json("我觉得没问题").is_none());
    }

    #[test]
    fn mode_parsing() {
        let mut m = Map::new();
        m.insert("postAuditMode".into(), Value::String("ai".into()));
        assert_eq!(mode(&m), Mode::Ai);
        m.insert("postAuditMode".into(), Value::String("all".into()));
        assert_eq!(mode(&m), Mode::All);
        m.insert("postAuditMode".into(), Value::String("off".into()));
        assert_eq!(mode(&m), Mode::Off);
        m.insert("postAuditMode".into(), Value::String("oops".into()));
        assert_eq!(mode(&m), Mode::Off);
    }
}
