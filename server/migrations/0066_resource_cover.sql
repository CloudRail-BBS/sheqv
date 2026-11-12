-- 0066：资源封面（logo / 截图）
--
-- 卡片与详情页原来只有「游戏配色的渐变占位 + 标题首字」，拉进来的外部条目也只能这样，
-- 读者认不出是什么资源。现在统一给一个 `cover`：
--   * 站内上传：发布/编辑时上传一张图，存 `/api/v1/media/<id>`；
--   * 外部拉取：直接用原站的 icon / logo 地址（绝对的 https 链接）。
--
-- 空串表示没有封面，前端回落到原来的渐变占位，老数据不需要回填。

ALTER TABLE resources ADD COLUMN IF NOT EXISTS cover text NOT NULL DEFAULT '';
