-- 0039：帖子浏览数
--
-- 列表卡片要显示「多少人看过」。只做累计计数，不记录谁看过：
-- 详情页每次打开 +1（仅 published），够用且不引入额外的去重表。

ALTER TABLE posts ADD COLUMN IF NOT EXISTS views bigint NOT NULL DEFAULT 0;
