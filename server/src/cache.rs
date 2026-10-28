//! 可选 Redis：缓存与限流。
//!
//! **没有 `REDIS_URL` 也能正常跑**：所有方法都退化成进程内实现。
//! 单实例自托管不配 Redis 就够用；多实例部署时配上，限流与缓存才会跨进程一致。
//!
//! 这里只做三件事：读/写带 TTL 的字符串、固定窗口计数。不要把它扩成通用 KV，
//! 缓存键散落各处，迁起来会很痛。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default)]
struct MemStore {
    strings: HashMap<String, (String, Instant)>,
    counters: HashMap<String, (i64, Instant)>,
}

/// 装配入口：没配 URL 或连不上都会返回一个可用的进程内实现
pub async fn connect(url: Option<&str>) -> (Cache, Option<String>) {
    Cache::connect(url).await
}

#[derive(Clone)]
pub struct Cache {
    /// None = 没配 Redis，走进程内
    redis: Option<redis::aio::ConnectionManager>,
    mem: Arc<Mutex<MemStore>>,
}

impl Cache {
    pub async fn connect(url: Option<&str>) -> (Self, Option<String>) {
        let Some(url) = url.map(str::trim).filter(|u| !u.is_empty()) else {
            return (
                Self { redis: None, mem: Arc::default() },
                None,
            );
        };

        let result = async {
            let client = redis::Client::open(url)?;
            let mgr = redis::aio::ConnectionManager::new(client).await?;
            Ok::<_, redis::RedisError>(mgr)
        }
        .await;

        match result {
            Ok(mgr) => (Self { redis: Some(mgr), mem: Arc::default() }, None),
            // 连不上不阻止启动：自托管常见场景是"配了但还没起来"
            Err(e) => (
                Self { redis: None, mem: Arc::default() },
                Some(format!("Redis 连接失败，已降级为进程内：{e}")),
            ),
        }
    }

    pub fn is_redis(&self) -> bool {
        self.redis.is_some()
    }

    /// 命中返回字符串；过期或未命中返回 None
    pub async fn get(&self, key: &str) -> Option<String> {
        if let Some(mut conn) = self.redis.clone() {
            match redis::cmd("GET").arg(key).query_async::<Option<String>>(&mut conn).await {
                Ok(v) => return v,
                Err(_) => return None,
            }
        }

        let mut mem = self.mem.lock().ok()?;
        match mem.strings.get(key) {
            Some((v, until)) if *until > Instant::now() => Some(v.clone()),
            Some(_) => {
                mem.strings.remove(key);
                None
            }
            None => None,
        }
    }

    pub async fn set(&self, key: &str, value: &str, ttl: Duration) {
        if let Some(mut conn) = self.redis.clone() {
            let _: Result<(), _> = redis::cmd("SET")
                .arg(key)
                .arg(value)
                .arg("EX")
                .arg(ttl.as_secs().max(1))
                .query_async(&mut conn)
                .await;
            return;
        }

        if let Ok(mut mem) = self.mem.lock() {
            // 顺手清掉过期项，避免进程内缓存无限增长
            if mem.strings.len() > 512 {
                let now = Instant::now();
                mem.strings.retain(|_, (_, until)| *until > now);
            }
            mem.strings
                .insert(key.to_string(), (value.to_string(), Instant::now() + ttl));
        }
    }

    /// 固定窗口计数：返回本次自增后的次数。窗口从第一次自增开始算。
    pub async fn incr(&self, key: &str, window: Duration) -> i64 {
        if let Some(mut conn) = self.redis.clone() {
            let count: Result<i64, _> = redis::cmd("INCR").arg(key).query_async(&mut conn).await;
            if let Ok(n) = count {
                if n == 1 {
                    let _: Result<(), _> = redis::cmd("EXPIRE")
                        .arg(key)
                        .arg(window.as_secs().max(1))
                        .query_async(&mut conn)
                        .await;
                }
                return n;
            }
            return 0;
        }

        let Ok(mut mem) = self.mem.lock() else {
            return 0;
        };
        let now = Instant::now();
        let entry = mem.counters.entry(key.to_string()).or_insert((0, now + window));
        if entry.1 <= now {
            *entry = (0, now + window);
        }
        entry.0 += 1;
        entry.0
    }

    pub async fn del(&self, key: &str) {
        if let Some(mut conn) = self.redis.clone() {
            let _: Result<(), _> = redis::cmd("DEL").arg(key).query_async(&mut conn).await;
            return;
        }
        if let Ok(mut mem) = self.mem.lock() {
            mem.strings.remove(key);
            mem.counters.remove(key);
        }
    }
}
