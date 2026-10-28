-- 0029：头衔申请制 + 外观样式
--
-- 头衔不再由用户自己写：改成提交申请、后台审核通过才生效（title_requests）。
-- 同时给头衔、身份组、徽章都加上「样式 + 特效」，样式键由后台配置、前端只认枚举值。
--
-- 样式与特效只存枚举字符串（如 `gold` / `shine`），具体色值在 CSS 里；
-- 这样换主题、加新样式都不用改库。

-- 头衔外观：样式（plain/blue/gold/violet/mint/solid/outline/holo）+ 特效（空/shine/glow/pulse）
ALTER TABLE users ADD COLUMN IF NOT EXISTS title_style text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS title_effect text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS title_requests (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       text NOT NULL,
    -- 申请时选的样式；审核通过时以后台最终选择为准
    style       text NOT NULL DEFAULT 'plain',
    effect      text NOT NULL DEFAULT '',
    reason      text NOT NULL DEFAULT '',
    -- pending / approved / rejected / cancelled
    status      text NOT NULL DEFAULT 'pending',
    review_note text NOT NULL DEFAULT '',
    reviewed_by text REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT title_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

-- 一人同时只能有一条待审申请，避免刷屏
CREATE UNIQUE INDEX IF NOT EXISTS title_requests_pending
    ON title_requests (user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS title_requests_list
    ON title_requests (status, created_at DESC);

-- 身份组外观：soft（当前淡底）/ solid（实心）/ outline（描边）/ glow（淡底 + 光晕）
ALTER TABLE groups ADD COLUMN IF NOT EXISTS style text NOT NULL DEFAULT 'soft';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS effect text NOT NULL DEFAULT '';

-- 徽章外观：每个徽章一条覆盖记录，没有记录就用目录里的默认语气色
CREATE TABLE IF NOT EXISTS badge_styles (
    badge_id   text PRIMARY KEY,
    style      text NOT NULL DEFAULT '',
    effect     text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);
