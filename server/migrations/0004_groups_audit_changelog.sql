-- 0004：身份组 / 内容审核 / 更新日志
--
-- 三件事共用一次迁移，因为它们互相依赖：
--   * 组的权限点决定「谁能审核」
--   * 审核表按 target_type 设计成通用，将来资源落库可直接复用
--   * 更新日志只是从代码搬到库里

-- ── 身份组 ───────────────────────────────
-- role 仍然保留（admin 后台通行证 + 最后一个管理员保护），
-- group 是**附加**的能力层：决定发帖/评论等权限、以及进组前必须签的公约。
CREATE TABLE IF NOT EXISTS groups (
    id                  text PRIMARY KEY,
    name                text NOT NULL,
    -- 稳定标识：代码里按 slug 判定内置组，改名不影响逻辑
    slug                text NOT NULL,
    color               text NOT NULL DEFAULT '',
    -- 数字大的排在前面；同权重按创建时间
    weight              integer NOT NULL DEFAULT 0,
    -- 新注册用户自动进入（全局只应有一个，后台会保证）
    is_default          boolean NOT NULL DEFAULT false,
    -- 内置组（member/admin）不可删除、slug 不可改
    is_builtin          boolean NOT NULL DEFAULT false,
    -- 权限点数组，例如 ["post.create","comment.create","audit.review"]
    permissions         jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- 进组必须已签署的公约 id，例如 ["community","trust"]
    required_agreements jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS groups_slug_lower ON groups (lower(slug));
CREATE INDEX IF NOT EXISTS groups_weight ON groups (weight DESC, created_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS group_id text REFERENCES groups (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_group ON users (group_id);

-- ── 内容审核 ─────────────────────────────
-- 帖子默认 published（保持现有行为），只有开启审核后新帖才进 pending。
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts ADD CONSTRAINT posts_status_check
    CHECK (status IN ('pending', 'published', 'rejected'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS posts_status ON posts (status, created_at DESC);

-- 审核流水：AI 与人工都写这里，便于回溯「谁在什么时候因为什么放行/拒绝」
CREATE TABLE IF NOT EXISTS audit_logs (
    id          text PRIMARY KEY,
    -- post / resource（资源落库后直接用）
    target_type text NOT NULL,
    target_id   text NOT NULL,
    -- approve / reject
    decision    text NOT NULL,
    -- ai / human
    source      text NOT NULL,
    -- 人工操作者；AI 判定为空
    actor_id    text REFERENCES users (id) ON DELETE SET NULL,
    reason      text,
    -- AI 给的 0–1 风险分，人工判定为空
    score       real,
    labels      jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_target ON audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_pending ON audit_logs (decision, created_at DESC);

-- ── 更新日志 ─────────────────────────────
CREATE TABLE IF NOT EXISTS changelog (
    id          text PRIMARY KEY,
    version     text NOT NULL DEFAULT '',
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    tag         text NOT NULL DEFAULT '功能',
    published   boolean NOT NULL DEFAULT true,
    released_at timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS changelog_list ON changelog (published, released_at DESC);
