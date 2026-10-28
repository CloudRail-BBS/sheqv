-- 0033：工单
--
-- 用户提交问题 → 管理员在后台回复 / 关闭，消息留成一条时间线。
-- 工单与私信分开：私信是点对点聊天，工单带分类、状态与处理记录，可追责、可统计。

CREATE TABLE IF NOT EXISTS tickets (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- account / report / bug / suggestion / other
    category   text NOT NULL DEFAULT 'other',
    subject    text NOT NULL,
    -- open（待处理）/ replied（已回复）/ closed（已关闭）
    status     text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    closed_at  timestamptz,
    CONSTRAINT tickets_status_check CHECK (status IN ('open', 'replied', 'closed'))
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id         text PRIMARY KEY,
    ticket_id  text NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    author_id  text REFERENCES users (id) ON DELETE SET NULL,
    -- user / admin / system
    role       text NOT NULL DEFAULT 'user',
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ticket_messages_role_check CHECK (role IN ('user', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS tickets_user ON tickets (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket ON ticket_messages (ticket_id, created_at);
