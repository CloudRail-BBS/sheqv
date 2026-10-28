-- 0036：资源审核 + 图片尺寸
--
-- 资源原先只有 published / hidden，发布即上线；现在和帖子一样走审核：
-- pending（待审）/ rejected（驳回）/ published / hidden（作者或后台下架）。
--
-- 同时给 user_media 补宽高：前端据此提前锁定图片框比例，加载前后不跳版。

ALTER TABLE resources ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_status_check;
ALTER TABLE resources ADD CONSTRAINT resources_status_check
    CHECK (status IN ('published', 'hidden', 'pending', 'rejected'));

-- 历史数据都是已发布，保持不动
COMMENT ON COLUMN resources.status IS 'published / hidden / pending / rejected';

ALTER TABLE user_media ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE user_media ADD COLUMN IF NOT EXISTS height integer;

CREATE INDEX IF NOT EXISTS resources_pending ON resources (created_at)
    WHERE status = 'pending';
