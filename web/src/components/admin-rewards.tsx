'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GiftCard, Prize } from '@/lib/reward-types';
import { fmtCardDate } from '@/lib/reward-types';

const CARD_EMPTY = {
  kind: 'gift',
  nickname: '',
  title: '',
  note: '',
  theme: '#3e7cff',
  rewardPoints: 50,
  rewardKind: '',
  rewardValue: '',
  count: 5,
  expiresDays: 30,
};

const PRIZE_EMPTY = {
  name: '',
  kind: 'points',
  points: 10,
  theme: '#3e7cff',
  weight: 20,
  stock: '',
};

export function AdminRewards() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [form, setForm] = useState(CARD_EMPTY);
  const [pf, setPf] = useState(PRIZE_EMPTY);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCodes, setLastCodes] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      fetch('/api/v1/admin/rewards/cards', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v1/admin/rewards/prizes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c?.items) setCards(c.items);
    if (p?.items) setPrizes(p.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCard(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setLastCodes([]);
    const res = await fetch('/api/v1/admin/rewards/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        rewardPoints: Number(form.rewardPoints) || 0,
        count: Number(form.count) || 1,
        expiresDays: Number(form.expiresDays) || 0,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '创建失败' });
      return;
    }
    const data = (await res.json()) as { items: GiftCard[] };
    setLastCodes(data.items.map((c) => c.code));
    setMsg({ kind: 'ok', text: form.kind === 'gift' ? '礼品卡已发出' : `已生成 ${data.items.length} 个兑换码` });
    void load();
  }

  async function removeCard(id: string) {
    if (!confirm('删除这张未使用的卡？')) return;
    const res = await fetch(`/api/v1/admin/rewards/cards/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败（已使用的卡不能删）' });
      return;
    }
    setMsg({ kind: 'ok', text: '已删除' });
    void load();
  }

  async function createPrize(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/rewards/prizes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: pf.name,
        kind: pf.kind,
        points: Number(pf.points) || 0,
        theme: pf.theme,
        weight: Number(pf.weight) || 1,
        stock: pf.stock === '' ? null : Number(pf.stock),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '创建失败' });
      return;
    }
    setPf(PRIZE_EMPTY);
    setMsg({ kind: 'ok', text: '奖品已加入奖池' });
    void load();
  }

  async function togglePrize(p: Prize) {
    const res = await fetch(`/api/v1/admin/rewards/prizes/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    }).catch(() => null);
    if (res?.ok) void load();
  }

  async function removePrize(id: string) {
    if (!confirm('从奖池删除这个奖品？已抽出的记录会保留。')) return;
    const res = await fetch(`/api/v1/admin/rewards/prizes/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) void load();
  }

  return (
    <>
      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}

      <div className="admin-split">
        <form className="card card-pad" onSubmit={createCard}>
          <h3 style={{ fontSize: 15 }}>发礼品卡 / 生成兑换码</h3>
          <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
            礼品卡点名发给一个用户，出现在他的卡包里；兑换码谁先兑谁得。
          </p>

          <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <label className="field">
              <span>类型</span>
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="gift">礼品卡（发给指定人）</option>
                <option value="code">兑换码（批量）</option>
              </select>
            </label>
            <label className="field">
              <span>{form.kind === 'gift' ? '收件人昵称 / @用户名' : '生成数量'}</span>
              {form.kind === 'gift' ? (
                <input
                  className="input"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="冒烟1792820638"
                  required
                />
              ) : (
                <input
                  className="input"
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: Number(e.target.value.replace(/\D/g, '')) || 1 })}
                />
              )}
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>卡名</span>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="开发者见面礼"
                maxLength={30}
                required
              />
            </label>
            <label className="field">
              <span>积分</span>
              <input
                className="input"
                value={form.rewardPoints}
                onChange={(e) => setForm({ ...form, rewardPoints: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
            <label className="field">
              <span>有效天数（0 = 长期）</span>
              <input
                className="input"
                value={form.expiresDays}
                onChange={(e) => setForm({ ...form, expiresDays: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
            <label className="field">
              <span>附加奖励</span>
              <select className="input" value={form.rewardKind} onChange={(e) => setForm({ ...form, rewardKind: e.target.value })}>
                <option value="">仅积分</option>
                <option value="title">同时送头衔</option>
              </select>
            </label>
            <label className="field">
              <span>头衔（2–8 字）</span>
              <input
                className="input"
                value={form.rewardValue}
                onChange={(e) => setForm({ ...form, rewardValue: e.target.value })}
                disabled={form.rewardKind !== 'title'}
                placeholder="红石匠"
                maxLength={8}
              />
            </label>
            <label className="field">
              <span>卡片主题色</span>
              <input className="input" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
            </label>
            <label className="field">
              <span>备注</span>
              <input
                className="input"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="显示在卡片上"
                maxLength={80}
              />
            </label>
          </div>

          <button className="btn btn-primary btn-sm" type="submit" disabled={busy} style={{ marginTop: 12 }}>
            {busy ? '处理中…' : form.kind === 'gift' ? '发出礼品卡' : '生成兑换码'}
          </button>

          {lastCodes.length > 0 && (
            <div className="code-out">
              <span className="small muted">刚生成的码（只显示一次，请自行保存）：</span>
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                {lastCodes.map((c) => (
                  <code key={c} className="mono">{c}</code>
                ))}
              </div>
            </div>
          )}
        </form>

        <form className="card card-pad" onSubmit={createPrize}>
          <h3 style={{ fontSize: 15 }}>奖池</h3>
          <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
            抽奖每次扣 20 积分，按权重随机；限量奖品抽完自动跳过。
          </p>

          <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>奖品名</span>
              <input className="input" value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} required />
            </label>
            <label className="field">
              <span>类型</span>
              <select className="input" value={pf.kind} onChange={(e) => setPf({ ...pf, kind: e.target.value })}>
                <option value="points">积分</option>
                <option value="gift">礼品卡（卡内含积分）</option>
                <option value="none">谢谢参与</option>
              </select>
            </label>
            <label className="field">
              <span>{pf.kind === 'gift' ? '卡内积分' : '积分数'}</span>
              <input
                className="input"
                value={pf.points}
                onChange={(e) => setPf({ ...pf, points: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
            <label className="field">
              <span>权重</span>
              <input
                className="input"
                value={pf.weight}
                onChange={(e) => setPf({ ...pf, weight: Number(e.target.value.replace(/\D/g, '')) || 1 })}
              />
            </label>
            <label className="field">
              <span>库存（留空不限）</span>
              <input
                className="input"
                value={pf.stock}
                onChange={(e) => setPf({ ...pf, stock: e.target.value.replace(/\D/g, '') })}
              />
            </label>
            <label className="field">
              <span>主题色</span>
              <input className="input" value={pf.theme} onChange={(e) => setPf({ ...pf, theme: e.target.value })} />
            </label>
          </div>

          <button className="btn btn-primary btn-sm" type="submit" disabled={busy} style={{ marginTop: 12 }}>
            加入奖池
          </button>

          <div className="lt-prizes" style={{ marginTop: 12 }}>
            {prizes.map((p) => (
              <div key={p.id} className="lt-prize" data-off={!p.enabled}>
                <span className="lt-dot" style={{ background: p.theme || 'var(--blue)' }} />
                <span>{p.name}</span>
                <span className="mono small muted">w{p.weight ?? ''}</span>
                <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                  {p.stock === null || p.stock === undefined ? '∞' : p.stock}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => togglePrize(p)}>
                  {p.enabled ? '停用' : '启用'}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => removePrize(p.id)}>
                  删
                </button>
              </div>
            ))}
            {prizes.length === 0 && <p className="small muted">奖池是空的，先加一个奖品。</p>}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 14, overflow: 'hidden' }}>
        <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <h3 style={{ fontSize: 14 }}>最近发放</h3>
          <span className="small muted">{cards.length} 条</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>卡名</th>
              <th>类型</th>
              <th>兑换码</th>
              <th>奖励</th>
              <th>状态</th>
              <th>创建</th>
              <th style={{ width: 70 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td className="small muted">{c.kind === 'gift' ? '礼品卡' : '兑换码'}</td>
                <td className="mono small">{c.code}</td>
                <td className="small muted">
                  {c.rewardPoints} 分{c.rewardKind === 'title' ? ` + ${c.rewardValue}` : ''}
                </td>
                <td>
                  {c.usedAt ? (
                    <span className="badge badge-ghost">已使用</span>
                  ) : (
                    <span className="badge badge-live">未使用</span>
                  )}
                </td>
                <td className="small muted">{fmtCardDate(c.createdAt)}</td>
                <td>
                  {!c.usedAt && (
                    <button className="btn btn-sm btn-ghost" onClick={() => removeCard(c.id)}>
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr>
                <td colSpan={7} className="small muted">还没有发过卡</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
