-- 0014：媒体文件支持对象存储
--
-- storage='db'  → bytes 有值（旧行为）
-- storage='s3'  → bytes 为空，object_key 指向桶内对象；读取时由后端代理
ALTER TABLE user_media ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'db';
ALTER TABLE user_media ADD COLUMN IF NOT EXISTS object_key text NOT NULL DEFAULT '';
ALTER TABLE user_media ALTER COLUMN bytes DROP NOT NULL;
