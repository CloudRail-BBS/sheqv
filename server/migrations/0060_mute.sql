-- 0060：禁言
--
-- 与封禁分开：封禁是整号停用（会话失效），禁言只是暂时不能发内容。
-- 到期自动失效，不需要定时任务：判定时比较 muted_until 与 now()。
ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_reason text NOT NULL DEFAULT '';
