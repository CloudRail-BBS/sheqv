-- 0012：用户上传的头像 / 背景图 / 帖子图片
--
-- 图片直接存 bytea，不落文件系统：
-- 1) 备份脚本只跑 pg_dump，落盘文件会漏备；
-- 2) 自托管单实例，2MB 以内的图完全放得下；
-- 3) 通过 /api/v1/media/{id} 同源输出，Canvas 分享图不会跨域污染。

CREATE TABLE IF NOT EXISTS user_media (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL DEFAULT 'post',
    mime       text NOT NULL,
    bytes      bytea NOT NULL,
    size       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_media_kind_check CHECK (kind IN ('avatar', 'background', 'post'))
);
CREATE INDEX IF NOT EXISTS user_media_user ON user_media (user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '';
