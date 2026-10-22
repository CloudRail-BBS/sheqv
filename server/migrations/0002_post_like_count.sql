-- 0002_post_like_count.sql
-- 点赞在 Node 版是「计数器」语义（同一人可重复点），且允许匿名。
-- 用计数器列保持行为一致；likes 表留给以后做「按人去重」。

ALTER TABLE posts ADD COLUMN like_count integer NOT NULL DEFAULT 0;
