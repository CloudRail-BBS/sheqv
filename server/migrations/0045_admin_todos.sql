-- 0045：后台待办
--
-- 后台每天要做的事有两类：
--   1. 系统自己排队出来的（待审帖子 / 待回工单 / 待审服务器 …）—— 这类不入库，实时统计；
--   2. 管理员顺手记的（「下周一把活动公告发出去」）—— 这类必须落库，否则刷新就没了。
-- 这张表只管第 2 类，第 1 类由 /api/v1/admin/overview 现算。
CREATE TABLE IF NOT EXISTS admin_todos (
    id         text PRIMARY KEY,
    title      text NOT NULL,
    note       text NOT NULL DEFAULT '',
    -- high / normal / low
    priority   text NOT NULL DEFAULT 'normal',
    -- 只有日期，没有具体时间：后台待办按天排就够了
    due_date   date,
    -- open / done
    status     text NOT NULL DEFAULT 'open',
    -- 用 ADMIN_TOKEN 应急通道创建时没有对应用户，允许为空
    created_by text REFERENCES users (id) ON DELETE SET NULL,
    done_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT admin_todos_priority_check CHECK (priority IN ('high', 'normal', 'low')),
    CONSTRAINT admin_todos_status_check CHECK (status IN ('open', 'done'))
);

-- 列表固定按「未完成 → 优先级 → 截止日」排，索引跟着这个顺序建
CREATE INDEX IF NOT EXISTS admin_todos_open
    ON admin_todos (status, priority, due_date);
