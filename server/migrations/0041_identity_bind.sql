-- 0041：一个账号同一平台只能绑一个第三方身份
-- 已有数据可能重复（历史回调并发），先去重再建唯一索引
DELETE FROM identities a
 USING identities b
 WHERE a.user_id = b.user_id
   AND a.provider = b.provider
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS identities_user_provider
    ON identities (user_id, provider);
