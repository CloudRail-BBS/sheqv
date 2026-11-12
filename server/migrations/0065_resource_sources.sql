-- 0065：资源的外部来源站
--
-- 「资源」不再只能是本站上传的文件：Minecraft 的条目可以指向 CurseForge / Modrinth 的
-- 项目页，铁锈战争指向 rtsbox（www.rtsbox.cn）的条目。库里只存站点 + 项目标识 + 类型，
-- 规范链接由 `resources::source_url()` 拼，避免各端各拼一套。
--
-- source 为空串表示「本站资源」——老数据全部落在这一档，不需要回填。

ALTER TABLE resources ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS source_id   text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT '';

-- 列表页要按来源筛选（例如只看 Modrinth 的整合包）
CREATE INDEX IF NOT EXISTS resources_source ON resources (source, created_at DESC) WHERE source <> '';
