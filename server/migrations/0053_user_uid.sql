-- 0053：用户 UID
--
-- 内部主键是 `umvlxxxx` 这种字符串，报给用户、互加好友、客服定位都不方便。
-- 这里补一个从 10001 开始的数字 UID：注册时由序列自动分配，对外只读。
CREATE SEQUENCE IF NOT EXISTS users_uid_seq START WITH 10001;

ALTER TABLE users ADD COLUMN IF NOT EXISTS uid bigint;
UPDATE users SET uid = nextval('users_uid_seq') WHERE uid IS NULL;

ALTER TABLE users ALTER COLUMN uid SET DEFAULT nextval('users_uid_seq');
ALTER TABLE users ALTER COLUMN uid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_uid_key ON users (uid);
