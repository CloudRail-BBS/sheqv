-- 0031：普通成员默认身份组
--
-- 历史问题：注册时从来没写过 `group_id`，而权限判定对「无组」一律拒绝，
-- 结果普通用户连帖子都发不了。这里补一个内置默认组，并把还没分组的普通用户放进去。
--
-- 只建一个默认组：已经有默认组（后台手动建的）就不再插，避免出现两个默认组。

INSERT INTO groups (id, name, slug, color, style, effect, description, weight,
                    is_default, is_builtin, permissions)
SELECT 'g-member', '普通成员', 'member', '#64748b', 'soft', '',
       '默认身份组：可以发帖、评论、发布资源。', 10, true, true,
       '["post.create","comment.create","resource.publish"]'::jsonb
WHERE NOT EXISTS (
        SELECT 1 FROM groups WHERE is_default OR lower(slug) = 'member' OR id = 'g-member'
      )
ON CONFLICT DO NOTHING;

-- 未分组的普通用户归到默认组；管理员不强制入组（角色本身就有全部权限）
UPDATE users
   SET group_id = (
        SELECT id FROM groups WHERE is_default ORDER BY weight DESC LIMIT 1
   )
 WHERE group_id IS NULL
   AND role <> 'admin'
   AND EXISTS (SELECT 1 FROM groups WHERE is_default);
