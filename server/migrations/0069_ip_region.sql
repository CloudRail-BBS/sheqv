-- 发帖 / 评论时记一次 IP 归属地（省级），详情页作者行显示「IP:山东」。
-- 只存归属地不存原始 IP：够展示，也少存一条个人信息。
-- 历史数据留空，前端拿不到就不显示，不回填（也回填不了）。
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ip_region text;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS ip_region text;
