-- 0027：赛事
--
-- 和「约战」不同：约战是两队自己约时间、走名单快照；赛事是官方组织的活动，
-- 有报名窗口、名额、赛程与结果。两者不共用表，避免把状态机混在一起。
--
-- 报名先落 pending，后台通过后计入名额；被拒的可以改资料重新提交
-- （唯一键仍是 tournament_id + user_id）。

CREATE TABLE IF NOT EXISTS tournaments (
    id           text PRIMARY KEY,
    title        text NOT NULL,
    -- minecraft / rusted_warfare
    game         text NOT NULL DEFAULT 'minecraft',
    mode         text NOT NULL DEFAULT '5v5',
    summary      text NOT NULL DEFAULT '',
    body         text NOT NULL DEFAULT '',
    cover        text NOT NULL DEFAULT '',
    prize        text NOT NULL DEFAULT '',
    -- draft / signup / running / ended
    status       text NOT NULL DEFAULT 'draft',
    signup_start timestamptz,
    signup_end   timestamptz,
    start_at     timestamptz,
    end_at       timestamptz,
    -- 0 = 不限
    max_entries  integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tournaments_game_check CHECK (game IN ('minecraft', 'rusted_warfare')),
    CONSTRAINT tournaments_status_check CHECK (status IN ('draft', 'signup', 'running', 'ended')),
    CONSTRAINT tournaments_max_check CHECK (max_entries >= 0)
);

CREATE INDEX IF NOT EXISTS tournaments_status ON tournaments (status, start_at);

CREATE TABLE IF NOT EXISTS tournament_entries (
    id            text PRIMARY KEY,
    tournament_id text NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    user_id       text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    team_name     text NOT NULL,
    contact       text NOT NULL DEFAULT '',
    note          text NOT NULL DEFAULT '',
    -- pending / approved / rejected
    status        text NOT NULL DEFAULT 'pending',
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tournament_entries_status_check
        CHECK (status IN ('pending', 'approved', 'rejected')),
    UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS tournament_entries_list
    ON tournament_entries (tournament_id, status, created_at);
