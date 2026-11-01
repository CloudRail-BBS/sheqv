'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 抽卡面板（福利中心的一个页签）。
 *
 * 抽卡是一次「扣积分 + 随机」的服务端动作，所以按钮必须有 loading 与失败提示；
 * 抽到之后弹一层全屏展示：光斑 + 射线 + 卡面翻入，稀有度越高光越亮。
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

export interface GachaCard {
  id: string;
  name: string;
  rarity: Rarity;
  emoji: string;
  color: string;
  descr: string;
  stock: number;
}

interface DrawLog {
  id: string;
  cardName: string;
  rarity: Rarity;
  cost: number;
  createdAt: number;
}

interface Data {
  enabled: boolean;
  cost: number;
  cards: GachaCard[];
  owned: Record<string, number>;
  recent: DrawLog[];
  points: number;
}

const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: '普通', color: '#8a8a90' },
  rare: { label: '稀有', color: '#3e7cff' },
  epic: { label: '史诗', color: '#7c5cff' },
  legend: { label: '传说', color: '#e8bf74' },
};

/** 卡面主色：后台填了就用后台的，没填按稀有度取默认 */
function faceColor(card: GachaCard): string {
  return card.color || RARITY[card.rarity]?.color || RARITY.common.color;
}

export function GachaPanel({
  onMsg,
}: {
  onMsg?: (m: { kind: 'ok' | 'err'; text: string } | null) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<GachaCard | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function load() {
    const res = await fetch('/api/v1/gacha').catch(() => null);
    const d = (await res?.json().catch(() => null)) as (Data & { ok?: boolean }) | null;
    if (!d) {
      setErr('读取卡池失败，稍后重试');
      return;
    }
    setData(d);
  }

  useEffect(() => {
    void load();
  }, []);

  // 弹层：锁滚动 + Esc 关闭
  useEffect(() => {
    if (!drawn) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawn]);

  async function draw() {
    if (busy || !data) return;
    setBusy(true);
    setErr(null);
    onMsg?.(null);
    const res = await fetch('/api/v1/gacha/draw', { method: 'POST' }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as
      | { ok?: boolean; card?: GachaCard; balance?: number; owned?: Record<string, number>; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !d?.card) {
      setErr(d?.message ?? '抽卡失败，稍后再试');
      return;
    }
    setDrawn(d.card);
    setData((prev) =>
      prev
        ? {
            ...prev,
            points: d.balance ?? prev.points,
            owned: d.owned ?? prev.owned,
            recent: [
              { id: `tmp-${Date.now()}`, cardName: d.card!.name, rarity: d.card!.rarity, cost: prev.cost, createdAt: Date.now() },
              ...prev.recent,
            ].slice(0, 8),
            cards: prev.cards.map((c) =>
              c.id === d.card!.id && c.stock > 0 ? { ...c, stock: c.stock - 1 } : c,
            ),
          }
        : prev,
    );
  }

  const stats = useMemo(() => {
    if (!data) return { total: 0, owned: 0 };
    const owned = data.cards.filter((c) => (data.owned[c.id] ?? 0) > 0).length;
    return { total: data.cards.length, owned };
  }, [data]);

  if (!data) {
    return <p className="small muted gacha-loading">{err ?? '正在读取卡池…'}</p>;
  }

  if (!data.enabled) {
    return (
      <div className="card card-pad gacha-empty">
        <b>抽卡暂时关闭</b>
        <p className="small muted">管理员关闭了卡池，过一阵再来看看。</p>
      </div>
    );
  }

  const affordable = data.points >= data.cost;

  return (
    <div className="gacha">
      <div className="gacha-head card card-pad">
        <div>
          <b>社区卡池</b>
          <p className="small muted">
            每次 {data.cost} 积分 · 已收集 {stats.owned}/{stats.total}
          </p>
        </div>
        <div className="gacha-head-right">
          <span className="gacha-points">
            <b>{data.points}</b> 积分
          </span>
          <button
            type="button"
            className="btn btn-primary gacha-draw"
            disabled={busy || !affordable || data.cards.length === 0}
            onClick={() => void draw()}
            title={!affordable ? '积分不够' : undefined}
          >
            {busy ? '抽卡中…' : affordable ? `抽一张 · ${data.cost}` : `还差 ${data.cost - data.points} 分`}
          </button>
        </div>
      </div>

      {err && <p className="small auth-err" style={{ marginTop: 8 }}>{err}</p>}

      {data.cards.length === 0 ? (
        <div className="card card-pad gacha-empty" style={{ marginTop: 12 }}>
          <b>卡池是空的</b>
          <p className="small muted">管理员还没有配置卡片。</p>
        </div>
      ) : (
        <div className="gacha-grid">
          {data.cards.map((c) => {
            const have = data.owned[c.id] ?? 0;
            return (
              <div
                className="gacha-card"
                key={c.id}
                data-rarity={c.rarity}
                data-locked={have === 0}
                style={{ ['--gc' as string]: faceColor(c) } as React.CSSProperties}
              >
                <div className="gacha-face">
                  <span className="gacha-emoji">{c.emoji || '🎴'}</span>
                  <span className="gacha-rarity">{RARITY[c.rarity]?.label ?? '普通'}</span>
                </div>
                <div className="gacha-info">
                  <b>{c.name}</b>
                  <span className="gacha-meta">
                    {c.descr || '　'}
                  </span>
                  <span className="gacha-owned">
                    {have > 0 ? `已拥有 ×${have}` : '未获得'}
                    {c.stock >= 0 && <em>剩 {c.stock}</em>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="rail-title" style={{ marginBottom: 6 }}>最近抽到</div>
          <div className="gacha-recent">
            {data.recent.map((r) => (
              <span key={r.id} className="gacha-recent-item" data-rarity={r.rarity}>
                {r.cardName}
              </span>
            ))}
          </div>
        </div>
      )}

      {mounted && drawn && createPortal(<GachaReveal card={drawn} onClose={() => setDrawn(null)} />, document.body)}
    </div>
  );
}

/** 获取特效：射线 + 光斑 + 卡面翻入 */
function GachaReveal({ card, onClose }: { card: GachaCard; onClose: () => void }) {
  const color = faceColor(card);
  const rays = useMemo(() => Array.from({ length: 18 }, (_, i) => i), []);
  const sparks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        angle: (Math.PI * 2 * i) / 18 + Math.random() * 0.4,
        dist: 90 + Math.random() * 120,
        delay: Math.random() * 0.5,
      })),
    [],
  );

  return (
    <div className="gacha-reveal" data-rarity={card.rarity} role="dialog" aria-modal="true">
      <div className="gacha-reveal-bg" onClick={onClose} />
      <div className="gacha-stage" style={{ ['--gc' as string]: color } as React.CSSProperties}>
        <div className="gacha-rays" aria-hidden="true">
          {rays.map((i) => (
            <i key={i} style={{ transform: `rotate(${(360 / rays.length) * i}deg)` }} />
          ))}
        </div>
        {sparks.map((s) => (
          <i
            key={s.id}
            className="gacha-spark"
            style={
              {
                '--dx': `${Math.cos(s.angle) * s.dist}px`,
                '--dy': `${Math.sin(s.angle) * s.dist}px`,
                '--delay': `${s.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}

        <div className="gacha-pop">
          <span className="gacha-pop-kicker">获得卡片</span>
          <div className="gacha-pop-card">
            <span className="gacha-emoji">{card.emoji || '🎴'}</span>
            <span className="gacha-rarity">{RARITY[card.rarity]?.label}</span>
          </div>
          <b className="gacha-pop-name">{card.name}</b>
          {card.descr && <p className="gacha-pop-desc">{card.descr}</p>}
          <button type="button" className="btn btn-primary gacha-pop-ok" autoFocus onClick={onClose}>
            收入图鉴
          </button>
        </div>
      </div>
    </div>
  );
}
