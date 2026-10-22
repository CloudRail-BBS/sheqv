-- 0001_init.sql · 方块竞技场初始 schema
--
-- 约定：
-- * 主键沿用 Node 版生成的文本 id（u + base36），**不要换成 uuid**，否则老链接与老 Cookie 全废
-- * 时间统一 timestamptz，API 出口再转毫秒（契约不变）
-- * 金额用 numeric(12,2)，不用 float
-- * 列表型小字段用 jsonb（tags / badges / clauses），不值得单表
-- * 迁移只增不改：已执行的文件不要编辑，新增改动请加 0002_*.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
    id            text PRIMARY KEY,
    username      text NOT NULL,
    nickname      text NOT NULL,
    -- scrypt$N$r$p$salt$hash；纯第三方登录账号为空串（禁止密码登录）
    password_hash text NOT NULL DEFAULT '',
    email         text,
    role          text NOT NULL CHECK (role IN ('admin', 'member')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    -- 站内信已读水位：这之后的评论算未读
    notif_read_at timestamptz,
    banned        boolean NOT NULL DEFAULT false,
    title         text,
    badges        jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- 大小写不敏感的唯一性，不依赖 citext 扩展
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_created ON users (created_at DESC);

CREATE TABLE identities (
    provider text NOT NULL CHECK (provider IN ('github', 'cnkd')),
    -- 平台侧唯一 id：GitHub numeric id / CNKD sub。**不能用昵称**，对方允许改名
    sub      text NOT NULL,
    user_id  text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    login    text NOT NULL,
    avatar   text,
    PRIMARY KEY (provider, sub)
);

CREATE INDEX identities_user ON identities (user_id);

CREATE TABLE posts (
    id         text PRIMARY KEY,
    title      text,
    body       text NOT NULL,
    guild      text NOT NULL DEFAULT '',
    tags       jsonb NOT NULL DEFAULT '[]'::jsonb,
    author_id  text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_created ON posts (created_at DESC, id DESC);

CREATE TABLE comments (
    id         text PRIMARY KEY,
    post_id    text NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    author_id  text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_post ON comments (post_id, created_at);

CREATE TABLE likes (
    post_id text NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    at      timestamptz NOT NULL DEFAULT now(),
    -- 主键天然幂等：INSERT ... ON CONFLICT DO NOTHING
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE agreements (
    id         text PRIMARY KEY,
    title      text NOT NULL,
    short      text NOT NULL,
    version    text NOT NULL,
    scope      text NOT NULL DEFAULT '',
    summary    text NOT NULL DEFAULT '',
    gate       text NOT NULL DEFAULT '',
    clauses    jsonb NOT NULL DEFAULT '[]'::jsonb,
    active     boolean NOT NULL DEFAULT true,
    -- 内置两份（诚信 / 社区），禁止停用与删除
    builtin    boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE signatures (
    agreement_id text NOT NULL REFERENCES agreements (id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    version      text NOT NULL,
    signed_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agreement_id, user_id)
);

CREATE TABLE announcements (
    id         text PRIMARY KEY,
    title      text NOT NULL,
    body       text NOT NULL,
    kind       text NOT NULL,
    pinned     boolean NOT NULL DEFAULT false,
    published  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX announcements_list ON announcements (published, pinned DESC, created_at DESC);

CREATE TABLE slides (
    id        text PRIMARY KEY,
    kicker    text NOT NULL DEFAULT '',
    title     text NOT NULL DEFAULT '',
    "desc"    text NOT NULL DEFAULT '',
    cta       text NOT NULL DEFAULT '',
    href      text NOT NULL DEFAULT '',
    -- bgImage 优先于 bgColor
    bg_color  text NOT NULL DEFAULT '',
    bg_image  text NOT NULL DEFAULT '',
    text_tone text NOT NULL DEFAULT 'light' CHECK (text_tone IN ('light', 'dark')),
    active    boolean NOT NULL DEFAULT true,
    -- order 是 SQL 保留字；对外序列化仍叫 order
    ord       integer NOT NULL DEFAULT 0
);

CREATE TABLE sponsors (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    avatar     text,
    amount     numeric(12, 2) NOT NULL DEFAULT 0,
    plan_title text,
    first_at   timestamptz,
    last_pay_at timestamptz,
    source     text NOT NULL CHECK (source IN ('afdian', 'manual')),
    -- 隐藏是运营决定，重同步不能抹掉；爱发电条目只能隐藏，手动条目可删
    hidden     boolean NOT NULL DEFAULT false
);

-- 业务设置：只存被后台改过的键，删行即回落到环境变量
CREATE TABLE settings (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
);

-- 零散状态：爱发电 syncedAt / lastCount / schema 版本说明等
CREATE TABLE meta (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
);

-- 中文站点的搜索：PG 自带 parser 不切中文，用 pg_trgm 做子串索引而不是 tsvector
CREATE INDEX posts_body_trgm ON posts USING gin (body gin_trgm_ops);
CREATE INDEX posts_title_trgm ON posts USING gin (title gin_trgm_ops);
