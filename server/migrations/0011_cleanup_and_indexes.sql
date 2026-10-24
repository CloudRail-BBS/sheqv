-- 0011：移除更新日志 + 热点查询索引
--
-- 更新日志整个功能已下线（前台 /changelog、后台 /admin/changelog、API 与表）。
-- 同时补几条列表/搜索真正会走的索引：资源按状态+分类翻页、帖子按作者、评论按时间、
-- 资源标题/简介的中文子串搜索（pg_trgm，与帖子同一套方案）。

DROP TABLE IF EXISTS changelog;

CREATE INDEX IF NOT EXISTS posts_author_created ON posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_created ON comments (created_at DESC);

CREATE INDEX IF NOT EXISTS resources_status_created ON resources (status, created_at DESC);
CREATE INDEX IF NOT EXISTS resources_status_game_category
    ON resources (status, game, category, created_at DESC);
CREATE INDEX IF NOT EXISTS resources_status_downloads
    ON resources (status, download_count DESC);
CREATE INDEX IF NOT EXISTS resources_title_trgm
    ON resources USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS resources_summary_trgm
    ON resources USING gin (summary gin_trgm_ops);
