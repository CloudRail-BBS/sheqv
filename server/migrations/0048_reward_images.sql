-- 0048：抽奖 / 礼品卡的奖品图片可以本地上传
--
-- 以前 `custom_image` / `reward_image` 只能填外链，管理员得先把图传到别处。
-- 现在允许管理员直接上传到本站媒体库：给 `user_media.kind` 增加 `reward`。
-- 只放开取值，不动已有数据；上传接口会单独校验管理员权限。
ALTER TABLE user_media DROP CONSTRAINT IF EXISTS user_media_kind_check;
ALTER TABLE user_media
    ADD CONSTRAINT user_media_kind_check
    CHECK (kind IN ('avatar', 'background', 'post', 'reward')) NOT VALID;
