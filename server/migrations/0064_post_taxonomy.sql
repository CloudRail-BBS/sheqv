-- 0064：帖子的版块与标签也做成后台可维护
--
-- 之前发帖弹窗里的「版块」只是前端本地状态（不落库），标签也是写死的 6 个，
-- 后端不校验。现在两样都进 content_categories，和百科/资源库共用一套后台：
--
--   scope = post_section  版块（有说明，展示在下拉里）
--   scope = post_tag      标签（轻量胶囊，最多 3 个）
--
-- 版块落到 posts.section（存 key），老帖子统一归到「常规」；
-- 标签仍然是 posts.tags 数组，只是写入时对着表校验。

ALTER TABLE posts ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT '常规';
CREATE INDEX IF NOT EXISTS posts_section_idx ON posts (section);

-- 0063 的 CHECK 只允许 wiki / resource，新用途要先放开
ALTER TABLE content_categories DROP CONSTRAINT IF EXISTS content_categories_scope_check;
ALTER TABLE content_categories
    ADD CONSTRAINT content_categories_scope_check
    CHECK (scope IN ('wiki', 'resource', 'post_section', 'post_tag'));

INSERT INTO content_categories (id, scope, key, label, descr, sort) VALUES
    ('cc-post-sec-normal', 'post_section', '常规', '常规', '日常分享与讨论',   10),
    ('cc-post-sec-ask',    'post_section', '提问', '提问', '求解答、求助',     20),
    ('cc-post-sec-recruit','post_section', '招募', '招募', '找人组队或加入',   30),
    ('cc-post-sec-match',  'post_section', '约战', '约战', '发起比赛与约练',   40),
    ('cc-post-sec-chat',   'post_section', '闲聊', '闲聊', '随便聊聊',         50),
    ('cc-post-tag-map',    'post_tag',     '地图',   '地图',   '', 10),
    ('cc-post-tag-modpack','post_tag',     '整合包', '整合包', '', 20),
    ('cc-post-tag-texture','post_tag',     '材质',   '材质',   '', 30),
    ('cc-post-tag-match',  'post_tag',     '约战',   '约战',   '', 40),
    ('cc-post-tag-recruit','post_tag',     '招募',   '招募',   '', 50),
    ('cc-post-tag-ask',    'post_tag',     '提问',   '提问',   '', 60)
ON CONFLICT DO NOTHING;
