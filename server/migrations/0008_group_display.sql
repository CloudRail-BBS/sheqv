-- 0008：身份组的展示信息
--
-- 组原本只有名字和颜色，用户看不到「这个组是什么」。
-- 加一句描述，公开列表把它和权限一起下发；后台可编辑。
-- 只补内置组的空值，不覆盖后台改过的内容。

ALTER TABLE groups ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

UPDATE groups
   SET description = '默认身份组。注册后自动加入，可以发帖、评论、参与讨论。'
 WHERE slug = 'member' AND description = '';

UPDATE groups
   SET description = '站点管理身份组。拥有全部权限：内容审核、用户与身份组管理、站点设置。'
 WHERE slug = 'admin' AND description = '';

-- 内置组补一个可见色：空色在界面上只能退化成灰底，和「未分组」分不开
UPDATE groups SET color = '#64748b' WHERE slug = 'member' AND color = '';
