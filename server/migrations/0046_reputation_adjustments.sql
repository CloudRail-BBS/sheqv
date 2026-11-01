-- 0046：信誉分的人工调整
--
-- 信誉改成「初始 100，只扣不加（自动）」之后，管理员需要能手动修正：
-- 比如刷分但没违规、或者已经扣过分但当事人申诉成功。
-- 每次调整都留一行记录，前台只显示汇总分，后台能看到明细。
CREATE TABLE IF NOT EXISTS reputation_adjustments (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- 正数表示加分，负数表示扣分；范围在接口层限制为 -100..100
    delta      integer NOT NULL,
    reason     text NOT NULL DEFAULT '',
    -- 用 ADMIN_TOKEN 应急通道操作时没有对应用户
    created_by text REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reputation_adjustments_user
    ON reputation_adjustments (user_id, created_at DESC);
