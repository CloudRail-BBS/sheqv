-- 0026：任务系统
--
-- 任务由后台定义，进度**不落计数器**：签到、发帖、评论这些行为本来就有表，
-- 每次查询按「当期起点」数一遍即可。好处是补数据、删帖后进度自然对齐，
-- 不需要维护一张容易漂移的 progress 表。
--
-- 领取记录用 (user_id, task_id, period_key) 做主键：
-- 日常任务是 `2026-10-28`，周任务是 `2026-W44`，一次性是 `once`，
-- 天然防重复领取，跨日也不用清表。

CREATE TABLE IF NOT EXISTS tasks (
    id            text PRIMARY KEY,
    title         text NOT NULL,
    description   text NOT NULL DEFAULT '',
    kind          text NOT NULL DEFAULT 'daily',
    metric        text NOT NULL,
    target        integer NOT NULL DEFAULT 1,
    reward_points integer NOT NULL DEFAULT 10,
    sort          integer NOT NULL DEFAULT 0,
    enabled       boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tasks_kind_check CHECK (kind IN ('daily', 'weekly', 'once')),
    CONSTRAINT tasks_metric_check
        CHECK (metric IN ('checkin', 'post', 'comment', 'like', 'resource', 'server')),
    CONSTRAINT tasks_target_check CHECK (target BETWEEN 1 AND 1000),
    CONSTRAINT tasks_reward_check CHECK (reward_points BETWEEN 0 AND 10000)
);

CREATE INDEX IF NOT EXISTS tasks_enabled ON tasks (enabled, sort, created_at);

CREATE TABLE IF NOT EXISTS task_claims (
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    task_id    text NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    period_key text NOT NULL,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, task_id, period_key)
);

CREATE INDEX IF NOT EXISTS task_claims_user ON task_claims (user_id, claimed_at DESC);
