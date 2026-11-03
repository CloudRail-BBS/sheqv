-- 0054：积分商城
--
-- 与福利中心的区别：抽奖 / 抽卡是「花积分赌一个结果」，商城是**明码标价直接换**。
-- 商品可以带图（复用 user_media.kind = 'reward' 的上传通道），库存 -1 表示不限量。
CREATE TABLE IF NOT EXISTS shop_items (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    descr      text NOT NULL DEFAULT '',
    image      text NOT NULL DEFAULT '',
    price      integer NOT NULL,
    stock      integer NOT NULL DEFAULT -1,
    active     boolean NOT NULL DEFAULT true,
    sort       integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shop_items_price_check CHECK (price > 0)
);

CREATE TABLE IF NOT EXISTS shop_orders (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_id    text REFERENCES shop_items (id) ON DELETE SET NULL,
    item_name  text NOT NULL,
    price      integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_orders_user ON shop_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shop_items_active ON shop_items (active, sort, created_at);
