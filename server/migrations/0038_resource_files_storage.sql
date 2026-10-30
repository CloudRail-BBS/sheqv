-- 0038：资源文件也可以走对象存储
--
-- 之前资源文件只写本地 `$DATA_DIR/uploads/resources/`，图片却走对象存储，
-- 两套存储各管一半。现在文件也记 storage / object_key：
--   storage = 'fs'（默认，老数据）| 's3'
-- 读取时按 storage 分流，删资源时可以连对象一起删。

ALTER TABLE resource_files ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'fs';
ALTER TABLE resource_files ADD COLUMN IF NOT EXISTS object_key text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS resource_files_storage ON resource_files (storage);
