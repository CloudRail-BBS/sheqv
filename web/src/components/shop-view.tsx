'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ShopItem, ShopSnapshot } from '@/lib/shop-types';

/**
 * 积分商城：明码标价，点一下直接兑换。
 *
 * 与抽奖 / 抽卡不同，这里没有随机性，所以不做「抽出结果」的仪式感，
 * 只在兑换成功后更新余额并给一句确认，避免和福利中心抢同一套视觉。
 */
export function ShopView({ initial, loggedIn }: { initial: ShopSnapshot; loggedIn: boolean }) {
  const router = useRouter();
  const [points, setPoints] = useState(initial.points);
  const [orders, setOrders] = useState(initial.orders);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function buy(item: ShopItem) {
    if (busy) return;
    setBusy(item.id);
    setMsg(null);
    const res = await fetch(`/api/v1/shop/${encodeURIComponent(item.id)}/redeem`, {
      method: 'POST',
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { balance?: number; itemName?: string; message?: string }
      | null;
    setBusy(null);

    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '兑换失败，稍后再试' });
      return;
    }
    if (typeof data?.balance === 'number') setPoints(data.balance);
    setOrders((prev) => [
      { id: `tmp-${Date.now()}`, itemName: data?.itemName ?? item.name, price: item.price, createdAt: Date.now() },
      ...prev,
    ].slice(0, 12));
    setMsg({ kind: 'ok', text: `已兑换「${data?.itemName ?? item.name}」，可在下方兑换记录里查看` });
    router.refresh();
  }

  return (
    <div className="shop-page">
      <div className="shop-head">
        <div>
          <span className="rw-kicker">SHOP</span>
          <h1 className="page-title">积分商城</h1>
          <p className="rw-sub">
            用积分直接换，不需要运气。兑换后积分立即扣除，记录会留在积分明细里。
          </p>
        </div>
        <div className="shop-balance">
          <span>我的积分</span>
          <b className="mono">{points}</b>
          <Link href="/points" className="small">
            明细 →
          </Link>
        </div>
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`} style={{ marginBottom: 6 }}>
          {msg.text}
        </p>
      )}

      {initial.items.length === 0 ? (
        <div className="card rw-empty">
          <b>商城还没上架商品</b>
          <p>管理员在「后台 → 商城」添加后，这里就会出现可以兑换的东西。</p>
        </div>
      ) : (
        <div className="shop-grid">
          {initial.items.map((item) => {
            const soldOut = item.stock === 0;
            const affordable = points >= item.price;
            return (
              <article key={item.id} className="card shop-card" data-out={soldOut || undefined}>
                <div className="shop-cover">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="shop-cover-fallback">{item.name.slice(0, 1)}</span>
                  )}
                  {item.stock >= 0 && (
                    <span className="shop-stock">{soldOut ? '已兑完' : `剩 ${item.stock}`}</span>
                  )}
                </div>
                <div className="shop-body">
                  <b>{item.name}</b>
                  {item.descr && <p>{item.descr}</p>}
                  <div className="shop-foot">
                    <span className="shop-price mono">
                      {item.price}
                      <i>积分</i>
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!loggedIn || soldOut || busy === item.id || !affordable}
                      onClick={() => void buy(item)}
                      title={!loggedIn ? '登录后可兑换' : soldOut ? '已兑完' : !affordable ? '积分不够' : undefined}
                    >
                      {busy === item.id ? '兑换中…' : !loggedIn ? '登录后兑换' : soldOut ? '已兑完' : '兑换'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {orders.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 14 }}>我的兑换记录</h3>
            <span className="small muted">最近 {orders.length} 次</span>
          </div>
          <div className="shop-orders">
            {orders.map((o) => (
              <div key={o.id} className="shop-order">
                <span className="shop-order-name">{o.itemName}</span>
                <span className="mono small muted">-{o.price}</span>
                <time className="small muted">
                  {new Date(o.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </time>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
