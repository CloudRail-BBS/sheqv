'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
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
  /** 自定义奖品：图片与领取说明 */
  image?: string;
  desc?: string;
  expiresAt?: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'cards', label: '我的礼品卡' },
  { key: 'code', label: '兑换码' },
  { key: 'lottery', label: '抽奖' },
];

export function RewardCenter({
  initial,
  hint,
  initialTab = 'cards',
}: {
  initial: RewardsSnapshot;
  hint?: string;
  initialTab?: Tab;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [snap, setSnap] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollName, setRollName] = useState('');

  useEffect(() => setMounted(true), []);

  // 有弹窗时锁滚动、支持 Esc；顶部栏被漏在遮罩外的问题靠 Portal 解决
  useEffect(() => {
    if (!reveal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReveal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [reveal]);

  /** 切页签顺便改 URL：刷新/分享回来还在同一页 */
  function switchTab(next: Tab) {
    setTab(next);
    const url = next === 'cards' ? '/rewards' : `/rewards?tab=${next}`;
    window.history.replaceState(null, '', url);
  }

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
      rewardImage: string;
      rewardDesc: string;
      note: string;
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
      note: data.note || card?.note,
      image: data.rewardImage || card?.rewardImage,
      desc: data.rewardDesc || card?.rewardDesc,
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
      rewardImage: string;
      rewardDesc: string;
      note: string;
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
      note: data.note,
      image: data.rewardImage,
      desc: data.rewardDesc,
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
          prize: {
            name: string;
            kind: string;
            points: number;
            theme: string;
            customTitle: string;
            customDesc: string;
            customImage: string;
          };
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
      title:
        data.prize.kind === 'custom' && data.prize.customTitle
          ? data.prize.customTitle
          : data.prize.name,
      points: data.prize.kind === 'points' ? data.prize.points : 0,
      giftPoints: data.giftPoints ?? 0,
      theme: data.prize.theme || '#3e7cff',
      image: data.prize.kind === 'custom' ? data.prize.customImage : undefined,
      desc: data.prize.kind === 'custom' ? data.prize.customDesc : undefined,
      note:
        data.prize.kind === 'gift'
          ? '礼品卡已放进卡包，记得去拆开'
          : data.prize.kind === 'custom'
            ? '奖品已放进卡包，凭卡号联系管理员领取'
            : data.prize.kind === 'none'
              ? '下次手气会更好'
              : undefined,
    });
    router.refresh();
  }

  return (
    <>
      <div className="rw-head">
        <div className="rw-head-main">
          <span className="rw-kicker">REWARDS</span>
          <h1 className="page-title">福利中心</h1>
          <p className="rw-sub">
            {hint || '礼品卡、兑换码与抽奖都在这里。礼品卡是点名发给你的，拆开时才有奖励。'}
          </p>
        </div>
        <div className="rw-balance">
          <span className="rw-balance-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d="m12 3.6 2.5 5.2 5.6.8-4 3.9 1 5.5-5.1-2.7-5.1 2.7 1-5.5-4-3.9 5.6-.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="rw-balance-main">
            <span>我的积分</span>
            <b className="mono">{fmtNum(snap.points)}</b>
          </div>
          <Link href="/points" className="rw-balance-link">
            明细 →
          </Link>
        </div>
      </div>

      <div className="rw-tabs" role="tablist" aria-label="福利分类">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className="rw-tab"
            data-on={tab === t.key}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
            {t.key === 'cards' && snap.cards.length > 0 && <span className="n">{snap.cards.length}</span>}
            {t.key === 'lottery' && snap.prizes.length > 0 && <span className="n">{snap.prizes.length}</span>}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginBottom: 10 }}>
          {msg.text}
        </p>
      )}

      {tab === 'cards' && (
        <div role="tabpanel" aria-label="我的礼品卡" className="rw-panel">
          {snap.cards.length === 0 ? (
            <div className="card rw-empty">
              <span className="rw-empty-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path
                    d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5zM4 8.5h16M12 4v16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <b>卡包还是空的</b>
              <p>管理员发放、抽奖抽到，都会出现在这里。拆开时才结算奖励。</p>
              <div className="rw-empty-acts">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => switchTab('lottery')}>
                  去抽一张
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => switchTab('code')}>
                  我有兑换码
                </button>
              </div>
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
                      {c.rewardKind === 'custom' ? (
                        <b className="gc-custom">{c.rewardValue || '实物奖品'}</b>
                      ) : (
                        <>
                          <b className="mono">{c.rewardPoints}</b>
                          <span>积分</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
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
        </div>
      )}

      {tab === 'code' && (
        <div className="rw-code" role="tabpanel" aria-label="兑换码">
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
        <div className="rw-lottery" role="tabpanel" aria-label="抽奖">
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

      {mounted && reveal && createPortal(
        <div
          className="gift-burst"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gift-title"
          onClick={() => setReveal(null)}
        >
          <div
            className="gb-glow"
            aria-hidden="true"
            style={{ background: `radial-gradient(circle, ${reveal.theme}66, transparent 68%)` }}
          />
          {particles.map((p) => (
            <i
              key={p.i}
              className="gb-particle"
              aria-hidden="true"
              style={{
                ['--tx' as string]: `${p.x}px`,
                ['--ty' as string]: `${p.y}px`,
                ['--delay' as string]: `${p.d}s`,
                ['--size' as string]: `${p.s}px`,
                background: reveal.theme,
              }}
            />
          ))}

          <div
            className="gb-panel"
            style={{ ['--gb' as string]: reveal.theme } as CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="gb-x" onClick={() => setReveal(null)} aria-label="关闭">
              ×
            </button>

            <div className="gb-top-kicker">CLOUDRAIL GIFT</div>
            <h2 className="gb-heading" id="gift-title">{reveal.heading}</h2>

            <div className="gb-ticket">
              <div className="gb-ticket-head">
                <span className="gb-brand">云轨社区</span>
                <span className="gb-serial mono">
                  NO.{new Date().toISOString().slice(0, 10).replace(/-/g, '')}
                </span>
              </div>
              {reveal.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gb-item-img" src={reveal.image} alt="" />
              )}
              <div className="gb-ticket-title">{reveal.title}</div>
              {(reveal.points > 0 || reveal.giftPoints) && (
                <div className="gb-ticket-points">
                  <b className="mono">+{reveal.points > 0 ? reveal.points : reveal.giftPoints}</b>
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
                <i>OPENED</i>
                <b>已拆</b>
              </span>
            </div>

            <p className="gb-result">
              {reveal.rewardKind === 'title' && reveal.rewardValue
                ? `头衔「${reveal.rewardValue}」已到账`
                : reveal.desc ||
                  reveal.note ||
                  (reveal.points > 0
                    ? '积分已存入你的账户，可在积分明细里查看'
                    : '奖励已发放到你的账号')}
            </p>

            <div className="gb-actions">
              <button type="button" className="gb-primary" autoFocus onClick={() => setReveal(null)}>
                收下
              </button>
              <button
                type="button"
                className="gb-secondary"
                onClick={() => {
                  setReveal(null);
                  switchTab('cards');
                }}
              >
                查看卡包
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
