-- 0063：内容分类可自定义
--
-- 百科与资源库的分类原来写死在三处（前端常量、后端白名单、表上的 CHECK），
-- 想加一类就得改代码重新发版。改成一张表，两个模块共用，后台可增删改排序：
--
--   scope  区分用途：wiki / resource
--   key    内容行里实际存的值，**不可修改**（改了就与已有内容脱钩）
--   label  展示名，随便改，不影响已有内容
--
-- 老数据的 key：百科是 ascii 短码（intro…），资源库直接就是中文分类名，
-- 两边都按原样搬进来，所以升级后不需要回填任何内容行。

CREATE TABLE IF NOT EXISTS content_categories (
    id         text PRIMARY KEY,
    scope      text NOT NULL,
    key        text NOT NULL,
    label      text NOT NULL,
    descr      text NOT NULL DEFAULT '',
    sort       integer NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT content_categories_scope_check CHECK (scope IN ('wiki', 'resource'))
);

CREATE UNIQUE INDEX IF NOT EXISTS content_categories_key
    ON content_categories (scope, key);

CREATE INDEX IF NOT EXISTS content_categories_order
    ON content_categories (scope, sort, label);

INSERT INTO content_categories (id, scope, key, label, descr, sort) VALUES
    ('cc-wiki-intro',      'wiki', 'intro',      '入门',     '第一次来？从这里开始',      10),
    ('cc-wiki-mechanics',  'wiki', 'mechanics',  '玩法机制', '规则、流程与判定标准',      20),
    ('cc-wiki-server',     'wiki', 'server',     '服务器',   '开服、联机与常见故障',      30),
    ('cc-wiki-dev',        'wiki', 'dev',        '开发',     '资源、客户端与接口约定',    40),
    ('cc-wiki-community',  'wiki', 'community',  '社区',     '公约、身份组与治理',        50),
    ('cc-res-maps',        'resource', '地图',     '地图',     '', 10),
    ('cc-res-modpacks',    'resource', '整合包',   '整合包',   '', 20),
    ('cc-res-textures',    'resource', '材质',     '材质',     '', 30),
    ('cc-res-shaders',     'resource', '光影',     '光影',     '', 40),
    ('cc-res-saves',       'resource', '存档',     '存档',     '', 50),
    ('cc-res-plugins',     'resource', '插件',     '插件',     '', 60),
    ('cc-res-tools',       'resource', '工具',     '工具',     '', 70),
    ('cc-res-other',       'resource', '其他',     '其他',     '', 80)
ON CONFLICT DO NOTHING;

-- 分类不再是固定集合，CHECK 必须去掉，否则自定义分类无法写入
ALTER TABLE wiki_entries DROP CONSTRAINT IF EXISTS wiki_category_check;
ALTER TABLE wiki_submissions DROP CONSTRAINT IF EXISTS wiki_submission_category_check;
