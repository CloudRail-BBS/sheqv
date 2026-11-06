-- 0062：百科投稿与审核
--
-- 词条本身仍是 wiki_entries（公开内容），投稿先落 wiki_submissions：
-- 新建词条（entry_id 为空）与修改现有词条（entry_id 指向目标）都走同一条审核通道，
-- 通过后才写入词条并生成历史版本，未通过的不会污染线上内容。

CREATE TABLE IF NOT EXISTS wiki_submissions (
    id           text PRIMARY KEY,
    -- 空 = 新词条；非空 = 修改该词条
    entry_id     text REFERENCES wiki_entries(id) ON DELETE CASCADE,
    title        text NOT NULL,
    summary      text NOT NULL DEFAULT '',
    body         text NOT NULL,
    category     text NOT NULL DEFAULT 'intro',
    tags         jsonb NOT NULL DEFAULT '[]'::jsonb,
    author_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'pending',
    note         text NOT NULL DEFAULT '',
    reviewer_id  text REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT wiki_submission_status_check
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT wiki_submission_category_check
        CHECK (category IN ('intro', 'mechanics', 'server', 'dev', 'community'))
);

-- 待审队列：先 pending，再按时间倒序
CREATE INDEX IF NOT EXISTS wiki_submission_queue
    ON wiki_submissions (status, created_at DESC);

-- 「我的投稿」
CREATE INDEX IF NOT EXISTS wiki_submission_author
    ON wiki_submissions (author_id, created_at DESC);

-- 一个词条同时只允许有一条待审修改，避免审核队列里堆重复稿
CREATE UNIQUE INDEX IF NOT EXISTS wiki_submission_one_pending
    ON wiki_submissions (entry_id)
    WHERE entry_id IS NOT NULL AND status = 'pending';
