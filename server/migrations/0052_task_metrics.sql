-- 0052：任务指标与现有功能联动
--
-- 新增四种可以直接从已有数据算出来的指标：
--   gacha（抽卡次数）/ lottery（抽奖次数）/ tournament（赛事报名）/ dm（发出的私信）
-- 都是「用户做过这件事 → 进度 +1」，不需要额外埋点，也不需要落计数器。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_metric_check;
ALTER TABLE tasks
    ADD CONSTRAINT tasks_metric_check
    CHECK (metric IN (
        'checkin', 'post', 'comment', 'like', 'resource', 'server',
        'gacha', 'lottery', 'tournament', 'dm'
    )) NOT VALID;
