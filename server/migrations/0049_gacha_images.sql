-- 0049：抽卡卡面支持上传图片
--
-- 之前卡面只有「符号 + 主色」，想用插画就得自己写死在前端。
-- 现在每张卡可以带一张图（和奖品图共用 `user_media.kind = 'reward'` 的上传通道），
-- 有图就用图，没图继续用 emoji，老数据不受影响。
ALTER TABLE gacha_cards ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '';
