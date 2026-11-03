-- 0056：UID 的展示样式
--
-- UID 是给用户互相认人用的，放在个人主页上要能看出「这是谁」。
-- 提供几种外观，用户自己挑一个；默认 plain（最克制的那种）。
ALTER TABLE users ADD COLUMN IF NOT EXISTS uid_style text NOT NULL DEFAULT 'plain';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_uid_style_check;
ALTER TABLE users
    ADD CONSTRAINT users_uid_style_check
    CHECK (uid_style IN ('plain', 'mono', 'solid', 'gradient', 'outline')) NOT VALID;
