-- 0017：资源本地上传文件
CREATE TABLE IF NOT EXISTS resource_files (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       text NOT NULL,
    mime       text NOT NULL DEFAULT 'application/octet-stream',
    size       bigint NOT NULL DEFAULT 0,
    path       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resource_files_user ON resource_files (user_id, created_at DESC);
