-- 0010：开发团队头像
--
-- 只存地址，不落文件：和用户主页背景一样，接受 http(s) 或站内路径。
-- 为空时前端回落到「简称色块」，榜单与分享图都按同一套规则降级。

ALTER TABLE dev_teams ADD COLUMN IF NOT EXISTS logo text NOT NULL DEFAULT '';
