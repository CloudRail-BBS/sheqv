-- 0043：社区百科
CREATE TABLE IF NOT EXISTS wiki_entries (
    id         text PRIMARY KEY,
    slug       text NOT NULL UNIQUE,
    title      text NOT NULL,
    summary    text NOT NULL DEFAULT '',
    body       text NOT NULL,
    category   text NOT NULL DEFAULT 'intro',
    tags       jsonb NOT NULL DEFAULT '[]'::jsonb,
    author_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published  boolean NOT NULL DEFAULT true,
    views      bigint NOT NULL DEFAULT 0,
    sort       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wiki_category_check
        CHECK (category IN ('intro', 'mechanics', 'server', 'dev', 'community'))
);

CREATE INDEX IF NOT EXISTS wiki_list
    ON wiki_entries (published, category, sort DESC, updated_at DESC);

-- 标题搜索（中文按子串命中，和帖子一样走 trigram）
CREATE INDEX IF NOT EXISTS wiki_search
    ON wiki_entries USING gin ((title || ' ' || summary || ' ' || body) gin_trgm_ops);
