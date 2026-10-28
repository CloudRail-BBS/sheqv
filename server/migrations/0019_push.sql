-- 0019：浏览器推送（Web Push）
--
-- 订阅由浏览器生成，endpoint 唯一；同一台设备重复订阅走 endpoint 冲突更新。
-- 过期订阅（推送服务返回 404/410）直接删，不发退订请求。

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          text PRIMARY KEY,
    user_id     text,
    endpoint    text NOT NULL,
    p256dh      text NOT NULL,
    auth        text NOT NULL,
    ua          text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    last_ok_at  timestamptz,
    fail_count  integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS push_endpoint_unique ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscriptions (user_id);

-- 发送记录：后台能回看「推了什么、发出去多少」
CREATE TABLE IF NOT EXISTS push_messages (
    id          text PRIMARY KEY,
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    url         text NOT NULL DEFAULT '/',
    audience    text NOT NULL DEFAULT 'all',
    sent_count  integer NOT NULL DEFAULT 0,
    fail_count  integer NOT NULL DEFAULT 0,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_audience_check CHECK (audience IN ('all', 'signed_in', 'admins'))
);

CREATE INDEX IF NOT EXISTS push_messages_recent ON push_messages (created_at DESC);
