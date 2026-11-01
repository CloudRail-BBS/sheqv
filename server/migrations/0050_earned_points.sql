-- 0050：等级改用「累计获得积分」
--
-- 等级以前读 `users.points`（余额），抽一次卡、换一张礼品卡就会掉级。
-- 现在改为累计获得：SUM(delta) 里只算正数，以及对删内容的冲正（*_revoke），
-- 消耗（抽奖 / 抽卡 / 兑换 / 礼品卡）不影响等级。
--
-- 查询按 user_id 过滤，只走一条部分索引就够；正数流水通常占大多数。
CREATE INDEX IF NOT EXISTS point_logs_earned
    ON point_logs (user_id)
    WHERE delta > 0;
