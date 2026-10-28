-- 0024：联机大厅上传改人工审核
--
-- 之前是「自由上传、默认展示」，现在要先过一遍后台。用独立的 status 列而不是
-- 复用 visibility：visibility 表示「管理员是否隐藏」，status 表示「是否通过审核」，
-- 两件事分开记，拒绝一条不会丢失它原本的可见性。
--
-- 默认 'approved' 让已有数据保持展示；新上传由应用层显式写 'pending'。

ALTER TABLE game_servers
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

ALTER TABLE game_servers
    DROP CONSTRAINT IF EXISTS game_servers_status_check;

ALTER TABLE game_servers
    ADD CONSTRAINT game_servers_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;

-- 后台按「待审核优先 + 新的在前」翻页
CREATE INDEX IF NOT EXISTS game_servers_status
    ON game_servers (status, created_at DESC);
