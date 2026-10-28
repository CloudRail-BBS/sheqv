-- 0020：私聊（一对一）
--
-- 会话按「两个 user id 字典序」唯一：user_a < user_b，避免同一对人出现两条记录。
-- 已读用位点（a_read_at / b_read_at）而不是逐条标记，未读数靠 count 算，
-- 这样标已读只是一次 UPDATE，不随消息量增长。

CREATE TABLE IF NOT EXISTS dm_conversations (
    id           text PRIMARY KEY,
    user_a       text NOT NULL,
    user_b       text NOT NULL,
    a_read_at    timestamptz NOT NULL DEFAULT to_timestamp(0),
    b_read_at    timestamptz NOT NULL DEFAULT to_timestamp(0),
    last_at      timestamptz NOT NULL DEFAULT now(),
    last_preview text NOT NULL DEFAULT '',
    last_sender  text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dm_pair_order CHECK (user_a < user_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS dm_pair_unique ON dm_conversations (user_a, user_b);
CREATE INDEX IF NOT EXISTS dm_user_a ON dm_conversations (user_a, last_at DESC);
CREATE INDEX IF NOT EXISTS dm_user_b ON dm_conversations (user_b, last_at DESC);

CREATE TABLE IF NOT EXISTS dm_messages (
    id         text PRIMARY KEY,
    conv_id    text NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id  text NOT NULL,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_msg_conv ON dm_messages (conv_id, created_at DESC);
-- 发信限流用：按人统计最近一分钟
CREATE INDEX IF NOT EXISTS dm_msg_sender ON dm_messages (sender_id, created_at DESC);
