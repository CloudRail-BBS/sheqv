-- 0022：资源元信息（参考 mcmod 的条目结构）
--
-- 都是可空字符串：老资源保持空，前台不显示这些行，不需要回填。
-- 不拆成关联表（版本 / 加载器 / 依赖各一张）：目前只做展示与筛选提示，
-- 拆表会让表单与查询复杂度翻倍，收益不抵成本。

ALTER TABLE resources ADD COLUMN IF NOT EXISTS game_versions text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS loaders       text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS deps          text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS source_url    text NOT NULL DEFAULT '';
