-- 0013：默认轮播改成中性欢迎语
--
-- 只改「从未被后台编辑过」的内置 s-welcome；管理员改过的文案不覆盖。
UPDATE slides
   SET kicker = '欢迎',
       title = '欢迎来到云轨社区',
       "desc" = '玩家社区、开发团队与赛事确权都在这里。先逛逛资源库，或者发第一条帖子。',
       cta = '去资源库',
       href = '/resources'
 WHERE id = 's-welcome'
   AND title = '注册一个账号，就能发帖、评论与签署公约';
