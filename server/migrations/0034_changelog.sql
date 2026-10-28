-- 0034：更新日志回归
--
-- 0011 曾把 changelog 整表删掉；现在恢复「前台展示 + 后台录入」。
-- 正文按行拆成要点，每行一条；tag 只影响要点前面的小标签颜色。

CREATE TABLE IF NOT EXISTS changelog (
    id          text PRIMARY KEY,
    version     text NOT NULL DEFAULT '',
    title       text NOT NULL,
    body        text NOT NULL DEFAULT '',
    tag         text NOT NULL DEFAULT '功能',
    published   boolean NOT NULL DEFAULT true,
    released_at timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS changelog_list ON changelog (published, released_at DESC);

-- 首次上线先放三条，避免页面空白；后台可改可删
INSERT INTO changelog (id, version, title, body, tag, published, released_at)
VALUES
    ('cseed0001', '2026.10.28.2', '工单与系统消息',
     E'新增工单系统：账号、举报、故障与建议都可以提交，处理过程留成时间线\n后台可以给单个用户或全站发送系统消息，计入站内信未读\n站内信浮层改为实底，阅读时不再透出背后的内容',
     '功能', true, '2026-10-28 18:00:00+08'),
    ('cseed0002', '2026.10.28.1', '蓝标 / 红标认证',
     E'新增蓝标（个人）与红标（机构）认证，名字后面挂认证印记\n头衔改为申请制，审核通过才生效\n赛事支持主办 / 参赛证书与竖版宣传图',
     '功能', true, '2026-10-28 12:00:00+08'),
    ('cseed0003', '2026.10.21.2', '人机验证修复',
     E'修复人机验证组件不显示、提交却提示未通过的问题\n登录与注册页的验证改为点击按钮拉起验证层\nAI 审核恢复，后台可配置接口地址、模型与提示词',
     '修复', true, '2026-10-21 20:00:00+08')
ON CONFLICT (id) DO NOTHING;
