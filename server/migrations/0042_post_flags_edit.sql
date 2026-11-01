-- 0042：帖子置顶 / 精华 / 二次编辑
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned    boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS featured  boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 置顶帖排在最前，列表查询走这个索引
CREATE INDEX IF NOT EXISTS posts_pinned_created ON posts (pinned DESC, created_at DESC);
