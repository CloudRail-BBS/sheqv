-- 0030：站内通知（业务事件）
--
-- 原来只有一种通知：别人评论了我的帖子，靠时间水位 `users.notif_read_at` 聚合。
-- 礼品卡、审核结果这类「一次性事件」必须有独立记录，否则读水位一过就再也找不到了。
--
-- 两类通知合并展示：本表的行按 `read_at` 标已读，评论仍走水位。

CREATE TABLE IF NOT EXISTS notifications (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- gift / title / tournament / server / task / system
    kind       text NOT NULL DEFAULT 'system',
    title      text NOT NULL,
    body       text NOT NULL DEFAULT '',
    href       text NOT NULL DEFAULT '',
    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_feed
    ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread
    ON notifications (user_id) WHERE read_at IS NULL;
