-- 0007：积分与签到
--
-- 积分只有一个来源：`point_logs`。用户行上的 `points` 是**冗余余额**，
-- 为了让排行榜 / 顶栏不必每次 SUM 全表；两者必须在同一事务里改，
-- 对不上时以 point_logs 为准重建（见 points::rebuild）。
--
-- 签到按「上海时区的一天」算：跨时区部署也不会出现「凌晨 0 点签到算前一天」。

ALTER TABLE users ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_streak integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_checkin date;
ALTER TABLE users ADD CONSTRAINT users_points_check CHECK (points >= 0) NOT VALID;

-- 积分流水：正负都记，reason 用固定枚举
CREATE TABLE IF NOT EXISTS point_logs (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    delta       integer NOT NULL,
    -- post / comment / checkin / admin
    reason      text NOT NULL,
    -- 关联对象（帖子 id / 评论 id / 签到日期），便于回溯与防重复
    ref         text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_logs_user ON point_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS point_logs_reason ON point_logs (reason, created_at DESC);

-- 每人每天最多一条：主键天然防重复签到
CREATE TABLE IF NOT EXISTS checkins (
    user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day         date NOT NULL,
    points      integer NOT NULL,
    streak      integer NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS checkins_day ON checkins (day);

-- 积分榜：只排有分的，避免 0 分用户占满
CREATE INDEX IF NOT EXISTS users_points_rank ON users (points DESC) WHERE points > 0;
