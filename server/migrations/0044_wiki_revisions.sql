-- 0044：百科历史版本
CREATE TABLE IF NOT EXISTS wiki_revisions (
    id         text PRIMARY KEY,
    entry_id   text NOT NULL REFERENCES wiki_entries(id) ON DELETE CASCADE,
    title      text NOT NULL,
    summary    text NOT NULL DEFAULT '',
    body       text NOT NULL,
    category   text NOT NULL,
    tags       jsonb NOT NULL DEFAULT '[]'::jsonb,
    editor_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wiki_rev_entry ON wiki_revisions (entry_id, created_at DESC);
