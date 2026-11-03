/** 积分商城的纯类型（客户端组件可直接引用） */

export interface ShopItem {
  id: string;
  name: string;
  descr: string;
  /** 商品图；空则用首字占位 */
  image: string;
  price: number;
  /** -1 表示不限量 */
  stock: number;
  active: boolean;
  sort: number;
}

export interface ShopOrder {
  id: string;
  itemName: string;
  price: number;
  createdAt: number;
}

export interface ShopSnapshot {
  items: ShopItem[];
  orders: ShopOrder[];
  points: number;
}
