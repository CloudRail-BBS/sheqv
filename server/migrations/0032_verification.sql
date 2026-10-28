-- 0032：蓝标 / 红标认证
--
-- 认证与头衔是两件事：
--   头衔 = 展示文案，自己申请、审核后挂在名字后面，可以随便换；
--   认证 = 身份背书，蓝标给个人、红标给机构，换取的是「这个名字后面的那个人/组织是谁」
--          被平台核对过，所以只能由管理员审核或直接授予，不能自设。
--
-- 标记本身只存 `blue` / `red` 两个枚举值，具体颜色在 CSS 里；换主题、换色都不用动库。

-- 认证结果（生效后才写这里）。空串表示未认证。
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_kind text NOT NULL DEFAULT '';
-- 对外说明，例如「云轨社区运营组」「B 站 UP 主」；鼠标悬停时展示
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_label text NOT NULL DEFAULT '';
-- 首次通过认证的时间；再次升级（蓝→红）不覆盖
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE TABLE IF NOT EXISTS verification_requests (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- blue（个人）/ red（机构）
    kind        text NOT NULL,
    -- 认证主体：个人真实身份或机构全称
    subject     text NOT NULL,
    -- 类别：内容创作者 / 服务器服主 / 公会 / 战队 / 开发团队 / 媒体 / 其他
    category    text NOT NULL DEFAULT '',
    -- 证明材料说明（含链接）
    evidence    text NOT NULL DEFAULT '',
    contact     text NOT NULL DEFAULT '',
    -- 通过时管理员最终确认的对外说明；空则回落 subject
    label       text NOT NULL DEFAULT '',
    -- pending / approved / rejected / cancelled
    status      text NOT NULL DEFAULT 'pending',
    review_note text NOT NULL DEFAULT '',
    reviewed_by text REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT verification_requests_kind_check
        CHECK (kind IN ('blue', 'red')),
    CONSTRAINT verification_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

-- 一人同时只能有一条待审，避免反复提交刷屏
CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_pending
    ON verification_requests (user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS verification_requests_list
    ON verification_requests (status, created_at DESC);
