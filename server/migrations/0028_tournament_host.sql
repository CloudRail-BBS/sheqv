-- 0028：赛事主办方
--
-- 证书要发给「办赛的人」，所以赛事需要记一个主办账号（用于判定谁能领主办证书）
-- 和一个对外显示的主办名称（可以是「XX 运营组」这类非账号主体）。
-- 主办账号被删除时只清空指向，赛事本身保留。

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS host_user_id text REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS host_name    text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS tournaments_host ON tournaments (host_user_id);
