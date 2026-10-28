-- 0025：自定义奖品
--
-- 之前礼品卡只能发积分或头衔，抽奖也只能抽积分 / 礼品卡。
-- 现在加第三种：`custom` —— 实物、周边、激活码这类需要线下或人工发放的东西。
-- 图片与说明都随奖品走，中奖 / 拆卡后直接展示给用户，免得再私聊问「我中了什么」。

ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS reward_image text NOT NULL DEFAULT '';
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS reward_desc  text NOT NULL DEFAULT '';

ALTER TABLE gift_cards DROP CONSTRAINT IF EXISTS gift_cards_reward_check;
ALTER TABLE gift_cards
    ADD CONSTRAINT gift_cards_reward_check
    CHECK (reward_kind IN ('', 'title', 'custom')) NOT VALID;

ALTER TABLE lottery_prizes ADD COLUMN IF NOT EXISTS custom_title text NOT NULL DEFAULT '';
ALTER TABLE lottery_prizes ADD COLUMN IF NOT EXISTS custom_desc  text NOT NULL DEFAULT '';
ALTER TABLE lottery_prizes ADD COLUMN IF NOT EXISTS custom_image text NOT NULL DEFAULT '';
