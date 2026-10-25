-- 0016：约战申请（最小可用链路：发起 → 对方接受 → 锁定）
CREATE TABLE IF NOT EXISTS matches (
    id               text PRIMARY KEY,
    title            text NOT NULL,
    game             text NOT NULL,
    format           text NOT NULL,
    maps             jsonb NOT NULL DEFAULT '[]'::jsonb,
    scheduled_at     timestamptz NOT NULL,
    note             text NOT NULL DEFAULT '',
    status           text NOT NULL DEFAULT 'pending_accept',
    creator_id       text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    creator_kind     text NOT NULL,
    creator_org_id   text NOT NULL,
    creator_name     text NOT NULL,
    creator_tag      text NOT NULL,
    opponent_kind    text NOT NULL,
    opponent_org_id  text NOT NULL,
    opponent_name    text NOT NULL,
    opponent_tag     text NOT NULL,
    accepted_by      text REFERENCES users (id) ON DELETE SET NULL,
    accepted_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT matches_status_check CHECK (status IN ('pending_accept', 'locked', 'declined')),
    CONSTRAINT matches_kind_check CHECK (creator_kind IN ('guild','team') AND opponent_kind IN ('guild','team'))
);
CREATE INDEX IF NOT EXISTS matches_created ON matches (created_at DESC);
CREATE INDEX IF NOT EXISTS matches_status ON matches (status, created_at DESC);
