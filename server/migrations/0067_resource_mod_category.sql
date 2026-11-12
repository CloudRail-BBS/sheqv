-- 0067：资源分类补一个「模组」
--
-- 原来只有 地图 / 整合包 / 材质 / 光影 / 存档 / 插件 / 工具 / 其他，从外部站拉进来的
-- 模组（Modrinth 的 mod、rtsbox 的 bbs_id=4）没地方放，只能落到「其他」。
-- `resources::suggest_category("mods")` 一直返回「模组」，这里把这一行补上，导入就自动归位。
--
-- 和 0063 一样按 (scope, key) 幂等插入：后台已经手建过同名分类的站点不会重复。

INSERT INTO content_categories (id, scope, key, label, descr, sort) VALUES
    ('cc-res-mods', 'resource', '模组', '模组', '游戏模组与扩展玩法', 15)
ON CONFLICT DO NOTHING;
