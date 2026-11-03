'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShopItem } from '@/lib/shop-types';
import { AdminImagePicker } from './admin-image-picker';

const EMPTY = {
  name: '',
  descr: '',
  image: '',
  price: 50,
  stock: '-1',
  sort: '0',
};

/**
 * 后台 · 积分商城。
 *
 * 只做「上架什么、多少钱、有多少」这三件事；兑换记录在用户侧看，
 * 后台不重复展示，避免同一个列表维护两份。
 */
export function AdminShop({ initial }: { initial: ShopItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function reload() {
    const res = await fetch('/api/v1/admin/shop', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { items: ShopItem[] };
      setItems(data.items ?? []);
    }
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMsg({ kind: 'err', text: '商品名不能为空' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/shop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        descr: form.descr,
        image: form.image,
        price: Number(form.price) || 1,
        stock: form.stock === '' ? -1 : Number(form.stock),
        sort: Number(form.sort) || 0,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '创建失败' });
      return;
    }
    setForm(EMPTY);
    setMsg({ kind: 'ok', text: '商品已上架' });
    void reload();
  }

  async function toggle(item: ShopItem) {
    const res = await fetch(`/api/v1/admin/shop/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    }).catch(() => null);
    if (res?.ok) void reload();
    else setMsg({ kind: 'err', text: '操作失败' });
  }

  async function remove(item: ShopItem) {
    if (!confirm(`删除「${item.name}」？已兑换的订单会保留。`)) return;
    const res = await fetch(`/api/v1/admin/shop/${item.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) void reload();
    else setMsg({ kind: 'err', text: '删除失败' });
  }

  return (
    <div className="col-main">
      <div className="adm-head">
        <div>
          <h1 className="page-title">积分商城</h1>
          <p className="adm-sub">用户用积分直接兑换的商品。库存填 -1 表示不限量。</p>
        </div>
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`}>{msg.text}</p>
      )}

      <div className="admin-split">
        <form className="card card-pad" onSubmit={create}>
          <h3 style={{ fontSize: 15 }}>上架商品</h3>
          <div className="gacha-form" style={{ marginTop: 10 }}>
            <label className="field gacha-form-wide">
              <span>商品名</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：定制键帽"
                maxLength={30}
              />
            </label>
            <label className="field">
              <span>价格（积分）</span>
              <input
                className="input"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
            <label className="field">
              <span>库存（-1 不限）</span>
              <input
                className="input"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/[^\d-]/g, '') })}
              />
            </label>
            <label className="field gacha-form-wide">
              <span>说明</span>
              <input
                className="input"
                value={form.descr}
                onChange={(e) => setForm({ ...form, descr: e.target.value })}
                placeholder="兑换后怎么领、多久发货"
                maxLength={300}
              />
            </label>
            <div className="gacha-form-wide">
              <AdminImagePicker
                value={form.image}
                onChange={(url) => setForm({ ...form, image: url })}
                label="商品图（可空）"
                hint="PNG / JPEG / WebP / GIF，不超过 2 MB；不传时用商品名首字。"
              />
            </div>
            <label className="field">
              <span>排序（小的在前）</span>
              <input
                className="input"
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: e.target.value.replace(/\D/g, '') })}
              />
            </label>
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy} style={{ marginTop: 12 }}>
            {busy ? '提交中…' : '上架'}
          </button>
        </form>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="console-card-head">
            <div>
              <h3 className="console-h3">商品列表</h3>
              <p className="small muted">下架后前台不再出现，但已兑换的记录保留。</p>
            </div>
            <span className="badge badge-ghost">{items.length} 件</span>
          </div>
          <div className="shop-admin-list">
            {items.length === 0 && <p className="small muted" style={{ padding: '4px 16px 14px' }}>还没有商品。</p>}
            {items.map((item) => (
              <div key={item.id} className="shop-admin-row" data-off={!item.active || undefined}>
                <span className="shop-admin-face">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" loading="lazy" />
                  ) : (
                    item.name.slice(0, 1)
                  )}
                </span>
                <div className="shop-admin-main">
                  <b>{item.name}</b>
                  <span className="small muted">
                    {item.price} 积分 · {item.stock < 0 ? '不限量' : `剩 ${item.stock}`}
                    {item.descr ? ` · ${item.descr}` : ''}
                  </span>
                </div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void toggle(item)}>
                  {item.active ? '下架' : '上架'}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void remove(item)}>
                  删
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
