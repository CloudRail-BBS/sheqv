'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtCardDate, type RewardsSnapshot } from '@/lib/reward-types';
import { fmtNum } from '@/lib/resource-types';

type Tab = 'cards' | 'code' | 'lottery';

interface Reveal {
  heading: string;
  title: string;
  points: number;
  giftPoints?: number;
  rewardKind?: string;
  rewardValue?: string;
  theme: string;
  note?: string;
  expiresAt?: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'cards', label: '我的礼品卡' },
  { key: 'code', label: '兑换码' },
  { key: 'lottery', label: '抽奖' },
];

export function RewardCenter({ initial }: { initial: RewardsSnapshot }) {
  const router = useRouter();
  const [snap, setSnap] = useState(initial);
  const [tab, setTab] = useState<Tab>('cards');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollName, setRollName] = useState('');

  const particles = useMemo(() => {
    if (!reveal) return [];
    return Array.from({ length: 26 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.5;
      const dist = 120 + Math.random() * 210;
      return {
        i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        d: Math.random() * 0.35,
        s: 5 + Math.random() * 7,
      };
    });
  }, [reveal]);

  function flash(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
  }

  async function openCard(id: string) {
    if (busy) return;
    const card = snap.cards.find((c) => c.id === id);
    setBusy(id);
    setMsg(null);
    const res = await fetch(`/api/v1/rewards/cards/${id}/open`, { method: 'POST' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      flash('err', data?.message ?? '拆卡失败');
      return;
    }
    const data = (await res.json()) as {
      title: string;
      points: number;
      rewardKind: string;
      rewardValue: string;
      balance: number;
    };
    setSnap((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id), points: data.balance }));
    setReveal({
      heading: '你的大礼包，已开启',
      title: data.title,
      points: data.points,
      rewardKind: data.rewardKind,
      rewardValue: data.rewardValue,
      theme: card?.theme || '#3e7cff',
      expiresAt: card?.expiresAt,
      note: card?.note,
    });
    router.refresh();
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy('code');
    setMsg(null);
    const res = await fetch('/api/v1/rewards/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      flash('err', data?.message ?? '兑换失败');
      return;
    }
    const data = (await res.json()) as {
      title: string;
      points: number;
      rewardKind: string;
      rewardValue: string;
      balance: number;
    };
    setCode('');
    setSnap((s) => ({ ...s, points: data.balance }));
    setReveal({
      heading: '兑换成功',
      title: data.title,
      points: data.points,
      rewardKind: data.rewardKind,
      rewardValue: data.rewardValue,
      theme: '#22c55e',
    });
    router.refresh();
  }

  async function draw() {
    if (rolling || busy) return;
    setBusy('lottery');
    setMsg(null);
    setRolling(true);

    const pool = snap.prizes.length > 0 ? snap.prizes : [{ name: '抽奖中…' } as { name: string }];
    let i = 0;
    const timer = setInterval(() => {
      setRollName(pool[i % pool.length]?.name ?? '…');
      i += 1;
    }, 80);

    const started = Date.now();
    const res = await fetch('/api/v1/rewards/lottery', { method: 'POST' }).catch(() => null);
    const data = res?.ok
      ? ((await res.json()) as {
          prize: { name: string; kind: string; points: number; theme: string };
          giftPoints?: number;
          cardId?: string | null;
          balance: number;
        })
      : null;

    const wait = Math.max(0, 1100 - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    clearInterval(timer);
    setRolling(false);
    setBusy(null);

    if (!data) {
      const err = (await res?.json().catch(() => null)) as { message?: string } | null;
      flash('err', err?.message ?? '抽奖失败');
      return;
    }

    setSnap((s) => ({
      ...s,
      points: data.balance,
      draws: [{ prizeName: data.prize.name, cost: snap.cost, at: Date.now() }, ...s.draws].slice(0, 10),
    }));
    setReveal({
      heading: '好运已开奖',
      title: data.prize.name,
      points: data.prize.kind === 'points' ? data.prize.points : 0,
      giftPoints: data.giftPoints ?? 0,
      theme: data.prize.theme || '#3e7cff',
      note:
        data.prize.kind === 'gift'
          ? '礼品卡已放进卡包，记得去拆开'
          : data.prize.kind === 'none'
            ? '下次手气会更好'
            : undefined,
    });
    router.refresh();
  }

  return (
    <>
      <div className="rw-head">
        <div>
          <h1 className="page-title">福利中心</h1>
          <p className="small muted" style={{ marginTop: 4, lineHeight: 1.8 }}>
            礼品卡、兑换码与抽奖都在这里。礼品卡是点名发给你的，拆开时才有奖励。
          </p>
        </div>
        <div className="rw-balance">
          <span>我的积分</span>
          <b className="mono">{fmtNum(snap.points)}</b>
          <Link href="/points" className="small">
            明细 →
          </Link>
        </div>
      </div>

      <div className="rw-tabs">
        {TABS.map((t) => (
          <button key={t.key} className="srv-tab" data-on={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'cards' && snap.cards.length > 0 && <span className="n">{snap.cards.length}</span>}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginBottom: 10 }}>
          {msg.text}
        </p>
      )}

      {tab === 'cards' && (
        <>
          {snap.cards.length === 0 ? (
            <div className="card card-pad">
              <p className="small muted" style={{ lineHeight: 1.8 }}>
                卡包是空的。管理员发放、抽奖抽到，都会出现在这里。
              </p>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 10 }} onClick={() => setTab('lottery')}>
                去抽一张
              </button>
            </div>
          ) : (
            <div className="gift-grid">
              {snap.cards.map((c) => (
                <article
                  key={c.id}
                  className="gift-card"
                  style={{ '--gc': c.theme || '#3e7cff' } as CSSProperties}
                >
                  <div className="gc-top">
                    <span className="gc-kicker">CLOUDRAIL GIFT</span>
                    <span className="gc-serial mono">NO.{c.id.slice(-4).toUpperCase()}</span>
                  </div>
                  <div className="gc-title">{c.title}</div>
                  <div className="gc-note">{c.note || '拆开看看里面是什么'}</div>
                  <div className="gc-expire">
                    {c.expiresAt ? `${fmtCardDate(c.expiresAt)} 前有效` : '长期有效'}
                  </div>
                  <div className="gc-perf" aria-hidden="true" />
                  <div className="gc-bottom">
                    <div className="gc-worth">
                      <b className="mono">{c.rewardPoints}</b>
                      <span>积分</span>
                    </div>
                  </div>
                  <button
                    className="gc-seal"
                    onClick={() => openCard(c.id)}
                    disabled={busy === c.id}
                    aria-label="拆开礼品卡"
                    title="拆开礼品卡"
                  >
                    <i>GIFT</i>
                    <b>{busy === c.id ? '…' : '拆'}</b>
                  </button>
                </article>
              ))}
            </div>
          )}

          {snap.history.length > 0 && (
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>最近拆过的卡</h3>
              <div className="rw-history">
                {snap.history.map((h) => (
                  <div key={h.id} className="rw-history-row">
                    <span>{h.title}</span>
                    <span className="mono small muted">+{h.rewardPoints}</span>
                    <span className="small muted">{fmtCardDate(h.usedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'code' && (
        <div className="rw-code">
          <div className="card card-pad">
            <h3 style={{ fontSize: 15 }}>输入兑换码</h3>
            <p className="small muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
              兑换码由管理员或活动发放，每个码只能使用一次，且只能由一个人兑换。
            </p>
            <form onSubmit={redeem} className="rw-code-form">
              <input
                className="input mono"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例如 ABCD123456"
                maxLength={32}
                autoComplete="off"
              />
              <button className="btn btn-primary" type="submit" disabled={busy === 'code' || !code.trim()}>
                {busy === 'code' ? '兑换中…' : '立即兑换'}
              </button>
            </form>
            <p className="small muted" style={{ marginTop: 10 }}>
              兑换记录会写进积分明细，可在 <Link href="/points" style={{ color: 'var(--blue)' }}>积分页</Link> 查看。
            </p>
          </div>
        </div>
      )}

      {tab === 'lottery' && (
        <div className="rw-lottery">
          <section className="lottery-stage">
            <div className="lt-glow" aria-hidden="true" />
            <div className="lt-kicker">LUCKY DRAW</div>
            <div className="lt-slot" data-rolling={rolling}>
              {rolling ? rollName : '准备好了吗'}
            </div>
            <p className="lt-desc">
              每次消耗 <b className="mono">{snap.cost}</b> 积分，奖池包含积分与礼品卡。
            </p>
            <button
              className="btn btn-primary lt-btn"
              onClick={draw}
              disabled={rolling || snap.points < snap.cost || snap.prizes.length === 0}
            >
              {rolling ? '抽取中…' : `抽一次（${snap.cost} 积分）`}
            </button>
            {snap.points < snap.cost && (
              <p className="small" style={{ color: 'var(--amber)', marginTop: 8 }}>
                积分不够，去签到或发布资源攒一点。
              </p>
            )}
            {snap.prizes.length === 0 && (
              <p className="small muted" style={{ marginTop: 8 }}>
                管理员还没配置奖池。
              </p>
            )}
          </section>

          <div className="card card-pad">
            <div className="between">
              <h3 style={{ fontSize: 14 }}>奖池</h3>
              <span className="small muted">{snap.prizes.length} 种</span>
            </div>
            <div className="lt-prizes">
              {snap.prizes.map((p) => (
                <div key={p.id} className="lt-prize" style={{ borderColor: `color-mix(in srgb, ${p.theme || '#3e7cff'} 40%, transparent)` }}>
                  <span className="lt-dot" style={{ background: p.theme || 'var(--blue)' }} />
                  <span>{p.name}</span>
                  {p.stock !== null && p.stock !== undefined && (
                    <span className="mono small muted" style={{ marginLeft: 'auto' }}>剩 {p.stock}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {snap.draws.length > 0 && (
            <div className="card card-pad">
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>我的抽奖记录</h3>
              <div className="rw-history">
                {snap.draws.map((d, i) => (
                  <div key={`${d.at}-${i}`} className="rw-history-row">
                    <span>{d.prizeName}</span>
                    <span className="mono small muted">-{d.cost}</span>
                    <span className="small muted">
                      {new Date(d.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {reveal && (
        <div className="gift-burst" role="dialog" aria-modal="true" aria-label="获得奖励">
          <div className="gb-glow" style={{ background: `radial-gradient(circle, ${reveal.theme}66, transparent 68%)` }} />
          {particles.map((p) => (
            <i
              key={p.i}
              className="gb-particle"
              style={{
                ['--tx' as string]: `${p.x}px`,
                ['--ty' as string]: `${p.y}px`,
                ['--delay' as string]: `${p.d}s`,
                ['--size' as string]: `${p.s}px`,
                background: reveal.theme,
              }}
            />
          ))}

          <div className="gb-panel" style={{ ['--gb' as string]: reveal.theme } as CSSProperties}>
            <button className="gb-x" onClick={() => setReveal(null)} aria-label="关闭">
              ×
            </button>
            <div className="gb-top-kicker">专属礼品卡</div>
            <div className="gb-heading">{reveal.heading}</div>

            <div className="gb-ticket">
              <div className="gb-ticket-head">
                <span className="gb-brand">CLOUDRAIL</span>
                <span className="gb-serial mono">2026 · GIFT</span>
              </div>
              <div className="gb-ticket-title">{reveal.title}</div>
              {(reveal.points > 0 || reveal.giftPoints) && (
                <div className="gb-ticket-points">
                  <b className="mono">{reveal.points > 0 ? reveal.points : reveal.giftPoints}</b>
                  <span>积分</span>
                </div>
              )}
              <div className="gb-perf" aria-hidden="true" />
              <div className="gb-ticket-foot">
                {reveal.expiresAt
                  ? `有效期至 ${new Date(reveal.expiresAt).toLocaleDateString('zh-CN')}`
                  : reveal.giftPoints
                    ? '礼品卡已存入卡包'
                    : '奖励已到账'}
              </div>
              <span className="gb-seal" aria-hidden="true">
                <i>GIFT</i>
                <b>拆</b>
              </span>
            </div>

            <div className="gb-result">
              {reveal.rewardKind === 'title' && reveal.rewardValue
                ? `头衔「${reveal.rewardValue}」已到账`
                : reveal.note || `${reveal.title} 已发放到你的账号`}
              {reveal.rewardKind === 'title' && reveal.note && (
                <div className="gb-note">{reveal.note}</div>
              )}
            </div>

            <div className="gb-actions">
              <button className="gb-primary" onClick={() => setReveal(null)}>
                收下
              </button>
              <Link href="/rewards" className="gb-secondary">
                查看卡包
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
