-- 0035：图片缩略图缓存
--
-- 起因：头像与帖子配图一直按原图直出，一个 33px 的头像会传 400KB、封面能到 1.3MB，
-- 首屏要等好几秒。原图存 user_media 不动，这里按「媒体 + 宽度」缓存缩过的版本，
-- 第一次请求生成、之后直接读，浏览器再长缓存。
--
-- 为什么不落文件系统：备份只跑 pg_dump，多一份目录就多一个漏备的地方；
-- 单张缩略图通常 5–30KB，放进库里的代价可以接受。
-- 删除原图时外键级联清掉缩略图，不会残留。

CREATE TABLE IF NOT EXISTS media_variants (
    media_id   text NOT NULL REFERENCES user_media (id) ON DELETE CASCADE,
    -- 目标宽度（像素）；头像同时是正方形边长
    width      integer NOT NULL,
    mime       text NOT NULL,
    bytes      bytea NOT NULL,
    size       integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (media_id, width),
    CONSTRAINT media_variants_width_check CHECK (width > 0 AND width <= 1600)
);
