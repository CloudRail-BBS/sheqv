-- 0051：关于社区的成员头像 / 单位 logo 支持本地上传
--
-- about_entries.avatar 一直存在，但后台只能填外链。这里沿用 0048 的媒体库：
-- 给 user_media.kind 再增加一个 about，上传接口同样只对管理员开放。
ALTER TABLE user_media DROP CONSTRAINT IF EXISTS user_media_kind_check;
ALTER TABLE user_media
    ADD CONSTRAINT user_media_kind_check
    CHECK (kind IN ('avatar', 'background', 'post', 'reward', 'about')) NOT VALID;
