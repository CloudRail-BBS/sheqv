-- 0023：资源多文件
--
-- 一个资源可以挂多个本地文件（地图 + 配置、整合包分卷等）。
-- 只引用 `resource_files`（用户上传记录），不复制文件行：
-- 文件本身仍由上传者持有，删除资源不会删文件记录。
--
-- 排序用 sort：表单里按添加顺序，详情页照此展示。
-- `name` / `size` 落库时快照一份，改文件名不影响已发布资源的展示。

CREATE TABLE IF NOT EXISTS resource_attachments (
    id          text PRIMARY KEY,
    resource_id text NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    file_id     text NOT NULL REFERENCES resource_files (id) ON DELETE CASCADE,
    name        text NOT NULL DEFAULT '',
    size        bigint NOT NULL DEFAULT 0,
    downloads   bigint NOT NULL DEFAULT 0,
    sort        integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (resource_id, file_id)
);

CREATE INDEX IF NOT EXISTS resource_attachments_res
    ON resource_attachments (resource_id, sort, created_at);
