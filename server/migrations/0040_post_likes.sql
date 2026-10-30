-- 0040：帖子点赞改为「一人一票」
CREATE TABLE IF NOT EXISTS post_likes (
    post_id    text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_likes_user ON post_likes (user_id);

-- 旧 like_count 是纯计数器（匿名也能无限刷），没有对应明细，统一归零后按明细重算
UPDATE posts SET like_count = (
    SELECT count(*) FROM post_likes pl WHERE pl.post_id = posts.id
);
