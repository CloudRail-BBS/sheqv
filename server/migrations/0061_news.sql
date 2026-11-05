-- 0061：社区新闻
--
-- 两件事：栏目可自定义（news_columns），新闻挂在栏目下（news_articles）。
-- 报刊导出不另建表：按 published_at 区间 + 栏目排序现场拼版，
-- 所以「一期报纸」不需要提前生成，也不会和新闻本身不同步。

CREATE TABLE IF NOT EXISTS news_columns (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    slug       text NOT NULL UNIQUE,
    intro      text NOT NULL DEFAULT '',
    sort       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_articles (
    id           text PRIMARY KEY,
    column_id    text REFERENCES news_columns(id) ON DELETE SET NULL,
    title        text NOT NULL,
    summary      text NOT NULL DEFAULT '',
    body         text NOT NULL DEFAULT '',
    cover        text NOT NULL DEFAULT '',
    author       text NOT NULL DEFAULT '',
    source       text NOT NULL DEFAULT '',
    published    boolean NOT NULL DEFAULT false,
    published_at timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_articles_time_idx ON news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS news_articles_column_idx ON news_articles (column_id, published_at DESC);

-- 默认栏目：够开一期报，之后在后台随便改
INSERT INTO news_columns (id, name, slug, intro, sort) VALUES
    ('nc_top',     '要闻',   'top',       '社区层面的重要决定与公告', 10),
    ('nc_esports', '赛事',   'esports',   '约战、联赛与赛后报道',     20),
    ('nc_dev',     '开发者', 'dev',       '资源、工具与开发团队动态', 30),
    ('nc_comm',    '社区',   'community', '玩家故事、活动与日常',     40)
ON CONFLICT (id) DO NOTHING;
