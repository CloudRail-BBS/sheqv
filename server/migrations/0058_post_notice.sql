-- 0058：管理员给任意帖子加声明
--
-- 声明不是正文，改帖不覆盖它；一条帖子只保留一条，可为空（清空即取消）。
ALTER TABLE posts ADD COLUMN IF NOT EXISTS admin_note text NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS admin_note_at timestamptz;
