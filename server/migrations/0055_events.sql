-- 0055：活动
--
-- 与赛事的区别：赛事是「报名 → 审核 → 对阵」的完整流程，
-- 活动更轻：一个时间段、一段说明、一个奖励，用户点「参加」就算报名。
CREATE TABLE IF NOT EXISTS events (
    id         text PRIMARY KEY,
    title      text NOT NULL,
    summary    text NOT NULL DEFAULT '',
    body       text NOT NULL DEFAULT '',
    cover      text NOT NULL DEFAULT '',
    reward     text NOT NULL DEFAULT '',
    starts_at  timestamptz,
    ends_at    timestamptz,
    -- draft / open / ended
    status     text NOT NULL DEFAULT 'draft',
    sort       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_status_check CHECK (status IN ('draft', 'open', 'ended'))
);

CREATE TABLE IF NOT EXISTS event_entries (
    id         text PRIMARY KEY,
    event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    note       text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_entries_event ON event_entries (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_list ON events (status, sort, starts_at);
