-- 轮播图按位置区分：首页 / 资源库 / 两处都放。
-- 老数据默认 home，行为不变。
ALTER TABLE slides
    ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'home';

-- 资源库页面的独立轮播不该混进首页那批，这里只做取值约束，不建索引（表很小）。
ALTER TABLE slides
    DROP CONSTRAINT IF EXISTS slides_placement_check;
ALTER TABLE slides
    ADD CONSTRAINT slides_placement_check
        CHECK (placement IN ('home', 'resources', 'both'));
