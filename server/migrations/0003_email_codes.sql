-- 邮箱验证码（当前只用于「邮箱验证码登录」，purpose 预留其它用途）
--
-- 设计取舍：
-- 1. **只存哈希**：库被拖走也拿不到能直接用的验证码。哈希用 HMAC-SHA256，
--    密钥是服务端 SESSION_SECRET（不出库）。
-- 2. **一次性**：consumed_at 非空即作废，重放无效。
-- 3. **attempts 计数**：连续输错 5 次这条记录作废，防止 6 位数字被暴力枚举。
-- 4. 保留 ip 仅用于排障与限流分析，不对外返回。

CREATE TABLE IF NOT EXISTS email_codes (
    id          text        PRIMARY KEY,
    email       text        NOT NULL,
    code_hash   text        NOT NULL,
    purpose     text        NOT NULL DEFAULT 'login',
    expires_at  timestamptz NOT NULL,
    attempts    integer     NOT NULL DEFAULT 0,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    ip          text
);

-- 按邮箱取最新一条、以及统计「最近 N 分钟发了几次」都走这个索引
CREATE INDEX IF NOT EXISTS email_codes_email_created
    ON email_codes (lower(email), created_at DESC);

-- 清理过期记录用
CREATE INDEX IF NOT EXISTS email_codes_expires
    ON email_codes (expires_at);
