-- 0009：资源库 / 开发团队 / 开发者身份 / 礼品卡与抽奖
--
-- 四块放在一次迁移里：资源是开发者与团队的战绩来源，
-- 礼品卡与抽奖又要互相发奖，拆开反而难回溯。

-- ── 开发者身份 ───────────────────────────
-- 首次发布资源时自动获得；撤销由后台操作。null 表示还不是开发者。
ALTER TABLE users ADD COLUMN IF NOT EXISTS developer_at timestamptz;
CREATE INDEX IF NOT EXISTS users_developer ON users (developer_at DESC) WHERE developer_at IS NOT NULL;

-- 个人主页背景图：只接受 http(s) 或站内路径，写入时校验
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_bg text NOT NULL DEFAULT '';

-- ── 开发团队 ─────────────────────────────
-- 与公会 / 战队是**三套独立实体**：开发团队面向资源作者，不参加约战。
CREATE TABLE IF NOT EXISTS dev_teams (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    tag         text NOT NULL,
    description text NOT NULL DEFAULT '',
    color       text NOT NULL DEFAULT '#3e7cff',
    -- 主攻游戏；空字符串表示跨游戏
    game        text NOT NULL DEFAULT '',
    owner_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dev_teams_name_lower ON dev_teams (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS dev_teams_tag_upper ON dev_teams (upper(tag));
CREATE INDEX IF NOT EXISTS dev_teams_owner ON dev_teams (owner_id);

CREATE TABLE IF NOT EXISTS dev_team_members (
    team_id   text NOT NULL REFERENCES dev_teams (id) ON DELETE CASCADE,
    user_id   text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role      text NOT NULL DEFAULT 'member',
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id),
    CONSTRAINT dev_team_members_role_check CHECK (role IN ('owner', 'member'))
);
CREATE INDEX IF NOT EXISTS dev_team_members_user ON dev_team_members (user_id);

-- ── 资源库 ───────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
    id             text PRIMARY KEY,
    title          text NOT NULL,
    summary        text NOT NULL DEFAULT '',
    body           text NOT NULL DEFAULT '',
    -- minecraft / roblox / rusted_warfare
    game           text NOT NULL,
    category       text NOT NULL,
    tags           jsonb NOT NULL DEFAULT '[]'::jsonb,
    author_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- 以团队名义发布时挂到团队；个人发布为空
    team_id        text REFERENCES dev_teams (id) ON DELETE SET NULL,
    url            text NOT NULL,
    version        text NOT NULL DEFAULT '',
    license        text NOT NULL DEFAULT '作者保留',
    size_bytes     bigint NOT NULL DEFAULT 0,
    -- published / hidden（后台下架）；不做人工预审，先发布再治理
    status         text NOT NULL DEFAULT 'published',
    like_count     integer NOT NULL DEFAULT 0,
    download_count integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resources_game_check CHECK (game IN ('minecraft', 'roblox', 'rusted_warfare')),
    CONSTRAINT resources_status_check CHECK (status IN ('published', 'hidden'))
);
CREATE INDEX IF NOT EXISTS resources_game_category ON resources (game, category, created_at DESC);
CREATE INDEX IF NOT EXISTS resources_team ON resources (team_id);
CREATE INDEX IF NOT EXISTS resources_author ON resources (author_id);
CREATE INDEX IF NOT EXISTS resources_hot ON resources (status, like_count DESC, download_count DESC);

CREATE TABLE IF NOT EXISTS resource_likes (
    resource_id text NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (resource_id, user_id)
);
CREATE INDEX IF NOT EXISTS resource_likes_user ON resource_likes (user_id);

-- 下载去重：同一用户同一天只计一次，避免刷新灌水；匿名下载不计数
CREATE TABLE IF NOT EXISTS resource_downloads (
    resource_id text NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day         date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Shanghai')::date),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (resource_id, user_id, day)
);

-- ── 礼品卡 / 兑换码 ──────────────────────
-- kind=gift：后台发给指定用户，出现在「我的礼品卡」里，拆开有特效；
-- kind=code：公开兑换码，谁先兑谁得，最多一次。
CREATE TABLE IF NOT EXISTS gift_cards (
    id              text PRIMARY KEY,
    kind            text NOT NULL DEFAULT 'gift',
    code            text NOT NULL UNIQUE,
    title           text NOT NULL,
    note            text NOT NULL DEFAULT '',
    theme           text NOT NULL DEFAULT '#3e7cff',
    reward_points   integer NOT NULL DEFAULT 0,
    -- '' / title：头衔；points 由 reward_points 表达
    reward_kind     text NOT NULL DEFAULT '',
    reward_value    text NOT NULL DEFAULT '',
    assigned_user_id text REFERENCES users (id) ON DELETE CASCADE,
    used_by         text REFERENCES users (id) ON DELETE SET NULL,
    used_at         timestamptz,
    expires_at      timestamptz,
    created_by      text REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT gift_cards_kind_check CHECK (kind IN ('gift', 'code')),
    CONSTRAINT gift_cards_reward_check CHECK (reward_kind IN ('', 'title'))
);
CREATE INDEX IF NOT EXISTS gift_cards_assigned ON gift_cards (assigned_user_id, used_at);
CREATE INDEX IF NOT EXISTS gift_cards_kind ON gift_cards (kind, created_at DESC);

-- ── 抽奖 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS lottery_prizes (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    -- points / gift / none
    kind        text NOT NULL DEFAULT 'points',
    points      integer NOT NULL DEFAULT 0,
    gift_title  text NOT NULL DEFAULT '',
    gift_theme  text NOT NULL DEFAULT '#3e7cff',
    weight      integer NOT NULL DEFAULT 10,
    -- null = 不限量；减到 0 后自动跳过
    stock       integer,
    enabled     boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lottery_draws (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    prize_id   text REFERENCES lottery_prizes (id) ON DELETE SET NULL,
    prize_name text NOT NULL,
    cost       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lottery_draws_user ON lottery_draws (user_id, created_at DESC);

-- 内置「开发者」身份组。description / color 与 0008 的写法保持一致。
INSERT INTO groups (id, name, slug, color, description, weight, is_default, is_builtin, permissions)
VALUES (
    'g-developer', '开发者', 'developer', '#0ea5e9',
    '面向资源作者的标识。发布第一个资源后自动获得，可创建开发团队。',
    50, false, true, '["post.create","comment.create","resource.publish"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 让管理员组拿到资源权限（老库不会因为 ON CONFLICT 自动补）
UPDATE groups
   SET permissions = permissions || '["resource.publish"]'::jsonb
 WHERE slug = 'admin' AND NOT (permissions ? 'resource.publish');
