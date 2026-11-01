-- 0047：福利中心 · 抽卡
--
-- 卡面用「符号 + 主色」而不是图片：后台填一个 emoji 和色值就能出新卡，
-- 不依赖对象存储，也不会因为图片挂了整张卡变成空白。
CREATE TABLE IF NOT EXISTS gacha_cards (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    -- common / rare / epic / legend
    rarity     text NOT NULL DEFAULT 'common',
    -- 抽中权重，越大越常见
    weight     integer NOT NULL DEFAULT 100,
    -- 卡面：一个符号 + 主色（空色由前端按稀有度取默认值）
    emoji      text NOT NULL DEFAULT '🎴',
    color      text NOT NULL DEFAULT '',
    descr      text NOT NULL DEFAULT '',
    -- -1 表示不限量
    stock      integer NOT NULL DEFAULT -1,
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT gacha_cards_rarity_check CHECK (rarity IN ('common', 'rare', 'epic', 'legend')),
    CONSTRAINT gacha_cards_weight_check CHECK (weight > 0)
);

-- 抽卡记录：卡名与稀有度存快照，卡片以后被删也不影响历史
CREATE TABLE IF NOT EXISTS gacha_draws (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id    text REFERENCES gacha_cards (id) ON DELETE SET NULL,
    card_name  text NOT NULL,
    rarity     text NOT NULL,
    cost       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gacha_draws_user ON gacha_draws (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gacha_draws_card ON gacha_draws (card_id);
