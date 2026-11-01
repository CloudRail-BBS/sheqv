'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 后台 · 抽卡管理。
 *
 * 卡面是「符号 + 主色」，不依赖图片上传：改一个 emoji 与色值就能出新卡。
 * 权重越大越常见；库存 -1 表示不限量。
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

export interface Card {
  id: string;
  name: string;
  rarity: Rarity;
  weight: number;
  emoji: string;
  color: string;
  descr: string;
  stock: number;
  active: boolean;
}

const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: '普通', color: '#8a8a90' },
  rare: { label: '稀有', color: '#3e7cff' },
  epic: { label: '史诗', color: '#7c5cff' },
  legend: { label: '传说', color: '#e8bf74' },
};

const BLANK: Card = {
  id: '',
  name: '',
  rarity: 'common',
  weight: 100,
  emoji: '🎴',
  color: '',
  descr: '',
  stock: -1,
  active: true,
};

export function AdminGacha({
  initial,
  initialConfig,
}: {
  initial: Card[];
  initialConfig: { cost: number; enabled: boolean };
}) {
  const [items, setItems] = useState(initial);
  const [config, setConfig] = useState(initialConfig);
  const [form, setForm] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const creating = form !== null && !form.id;

  async function saveConfig(next: { cost?: number; enabled?: boolean }) {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/gacha/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '保存失败' });
      return;
    }
    setConfig((c) => ({ ...c, ...next }));
    setMsg({ kind: 'ok', text: '已保存' });
  }

  async function saveCard() {
    if (!form) return;
    if (!form.name.trim()) {
      setMsg({ kind: 'err', text: '卡名必填' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const body = {
      name: form.name.trim(),
      rarity: form.rarity,
      weight: Number(form.weight) || 100,
      emoji: form.emoji.trim() || '🎴',
      color: form.color.trim(),
      descr: form.descr.trim(),
      stock: Number(form.stock),
      active: form.active,
    };
    const res = await fetch(
      creating ? '/api/v1/admin/gacha' : `/api/v1/admin/gacha/${form.id}`,
      {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { item?: Card; message?: string } | null;
    setBusy(false);
    if (!res?.ok || !d?.item) {
      setMsg({ kind: 'err', text: d?.message ?? '保存失败' });
      return;
    }
    const saved = d.item;
    setItems((prev) =>
      creating ? [...prev, saved] : prev.map((c) => (c.id === saved.id ? saved : c)),
    );
    setForm(null);
    setMsg({ kind: 'ok', text: creating ? '已创建' : '已保存' });
  }

  async function remove(card: Card) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/gacha/${card.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败' });
      return;
    }
    setItems((prev) => prev.filter((c) => c.id !== card.id));
    setMsg({ kind: 'ok', text: `已删除「${card.name}」` });
  }

  return (
    <div className="col-main">
      <div className="adm-head">
        <div>
          <h1 className="page-title">抽卡</h1>
          <p className="adm-head-sub">
            <span>福利中心的卡池</span>
            <span className="adm-dot">·</span>
            <span>权重越大越容易抽到</span>
          </p>
        </div>
        <div className="adm-head-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm(BLANK)}>
            + 添加卡片
          </button>
        </div>
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 6 }}>
          {msg.text}
        </p>
      )}

      <section className="card card-pad">
        <div className="between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 13 }}>抽卡设置</h3>
            <p className="small muted" style={{ marginTop: 3 }}>
              关闭后前台显示「暂未开放」，已经抽到的卡不受影响。
            </p>
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              单次消耗
              <input
                className="input"
                style={{ width: 84, height: 32 }}
                type="number"
                min={1}
                max={10000}
                value={config.cost}
                onChange={(e) => setConfig({ ...config, cost: Number(e.target.value) })}
              />
              积分
            </label>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              开放抽卡
            </label>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => void saveConfig({ cost: config.cost, enabled: config.enabled })}
            >
              保存设置
            </button>
          </div>
        </div>
      </section>

      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="adm-panel-head">
          <div>
            <h3>卡池</h3>
            <p>共 {items.length} 张 · 上架 {items.filter((c) => c.active).length} 张</p>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="small muted" style={{ padding: '18px 16px' }}>
            还没有卡片，先添加一张。
          </p>
        ) : (
          <div className="gacha-admin-list">
            {items.map((c) => (
              <div key={c.id} className="gacha-admin-row">
                <span
                  className="gacha-admin-face"
                  style={{ background: `color-mix(in srgb, ${c.color || RARITY[c.rarity].color} 22%, var(--panel-2))` }}
                >
                  {c.emoji || '🎴'}
                </span>
                <div className="gacha-admin-main">
                  <b>{c.name}</b>
                  <span className="small muted">
                    {RARITY[c.rarity].label} · 权重 {c.weight} ·
                    {c.stock < 0 ? ' 不限量' : ` 剩 ${c.stock} 张`}
                    {c.descr ? ` · ${c.descr}` : ''}
                  </span>
                </div>
                <span className={'badge ' + (c.active ? 'badge-live' : 'badge-ghost')}>
                  {c.active ? '上架中' : '已下架'}
                </span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm(c)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy}
                  onClick={() => void remove(c)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {form &&
        createPortal(
          <div className="composer-modal" role="dialog" aria-modal="true" aria-label="编辑卡片">
            <button type="button" className="composer-backdrop" aria-label="关闭" onClick={() => setForm(null)} />
            <div className="composer-panel org-modal">
              <div className="composer-panel-head" style={{ marginBottom: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="composer-head-title">{creating ? '新建卡片' : '编辑卡片'}</b>
                  <div className="composer-head-sub">符号 + 主色就是卡面，不需要上传图片</div>
                </div>
                <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={() => setForm(null)}>
                  ×
                </button>
              </div>

              <div className="gacha-form">
                <label className="field">
                  <span>卡名</span>
                  <input
                    className="input"
                    value={form.name}
                    maxLength={24}
                    placeholder="如：夜行的苦力怕"
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>稀有度</span>
                  <select
                    className="input"
                    value={form.rarity}
                    onChange={(e) => setForm({ ...form, rarity: e.target.value as Rarity })}
                  >
                    {(Object.keys(RARITY) as Rarity[]).map((r) => (
                      <option key={r} value={r}>
                        {RARITY[r].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>权重</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={10000}
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>库存（-1 不限）</span>
                  <input
                    className="input"
                    type="number"
                    min={-1}
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>符号</span>
                  <input
                    className="input"
                    value={form.emoji}
                    maxLength={4}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>主色（留空按稀有度）</span>
                  <input
                    className="input"
                    value={form.color}
                    placeholder="#7c5cff"
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                </label>
                <label className="field gacha-form-wide">
                  <span>描述</span>
                  <input
                    className="input"
                    value={form.descr}
                    maxLength={120}
                    placeholder="一句话，展示在卡面下方"
                    onChange={(e) => setForm({ ...form, descr: e.target.value })}
                  />
                </label>
              </div>

              <label className="row" style={{ gap: 6, fontSize: 12, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                上架（参与抽取）
              </label>

              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={() => void saveCard()}
                >
                  {busy ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
