-- 0057：关注关系
--
-- 首页「关注」标签需要真实的关注数据：一个人关注了谁，就在列表里看到谁发的帖子。
-- 单向关注，不要求互关；自己不能关注自己（CHECK 兜底）。
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    followee_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CONSTRAINT user_follows_self CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS user_follows_followee ON user_follows (followee_id);
