-- 0006：公会与战队（两个独立实体）
--
-- 为什么是两张表而不是一张带 kind 的表：
-- * 两者没有从属关系——**战队独立于公会**，可以加入公会，但不属于公会，
--   榜单、成员、证书都是各算各的；用一张表反而要靠 kind 到处过滤。
-- * 将来两边的字段会分叉（公会要有公会战、战队要有名单快照），
--   现在合成一张，分叉时还得拆。
-- 两张表结构相同，代码里用同一个仓库层（`orgs`）操作。

CREATE TABLE IF NOT EXISTS guilds (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    -- 简称 / 徽记文字，2–4 字
    tag         text NOT NULL,
    -- 游戏所属：一个公会只属于一个游戏，跨游戏请分别创建
    game        text NOT NULL,
    intro       text NOT NULL DEFAULT '',
    -- 负责人（创建者）；账号被删后置空，数据保留
    owner_id    text REFERENCES users (id) ON DELETE SET NULL,
    -- recruiting / training / rest
    status      text NOT NULL DEFAULT 'recruiting',
    points      integer NOT NULL DEFAULT 0,
    wins        integer NOT NULL DEFAULT 0,
    losses      integer NOT NULL DEFAULT 0,
    members     integer NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT guilds_game_check CHECK (game IN ('minecraft', 'roblox', 'rusted_warfare')),
    CONSTRAINT guilds_status_check CHECK (status IN ('recruiting', 'training', 'rest')),
    CONSTRAINT guilds_score_check CHECK (points >= 0 AND wins >= 0 AND losses >= 0 AND members >= 0)
);

CREATE TABLE IF NOT EXISTS teams (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    tag         text NOT NULL,
    game        text NOT NULL,
    intro       text NOT NULL DEFAULT '',
    owner_id    text REFERENCES users (id) ON DELETE SET NULL,
    status      text NOT NULL DEFAULT 'recruiting',
    points      integer NOT NULL DEFAULT 0,
    wins        integer NOT NULL DEFAULT 0,
    losses      integer NOT NULL DEFAULT 0,
    members     integer NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT teams_game_check CHECK (game IN ('minecraft', 'roblox', 'rusted_warfare')),
    CONSTRAINT teams_status_check CHECK (status IN ('recruiting', 'training', 'rest')),
    CONSTRAINT teams_score_check CHECK (points >= 0 AND wins >= 0 AND losses >= 0 AND members >= 0)
);

-- 同一游戏内名称与简称唯一（大小写不敏感），跨游戏允许同名
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_game ON guilds (game, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS guilds_tag_game ON guilds (game, upper(tag));
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_game ON teams (game, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS teams_tag_game ON teams (game, upper(tag));

-- 一个人只能负责一个公会、一个战队：避免开小号刷榜
CREATE UNIQUE INDEX IF NOT EXISTS guilds_owner ON guilds (owner_id) WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teams_owner ON teams (owner_id) WHERE owner_id IS NOT NULL;

-- 榜单排序：积分 → 胜场 → 少负 → 早创建
CREATE INDEX IF NOT EXISTS guilds_rank ON guilds (points DESC, wins DESC, losses ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS teams_rank ON teams (points DESC, wins DESC, losses ASC, created_at ASC);
