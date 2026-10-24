'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CHECKIN_BASE,
  STREAK_BONUS_MAX,
  rewardFor,
  type CheckinResult,
  type PointsSnapshot,
} from '@/lib/point-types';

/**
 * 签到卡：首页右栏与 /points 共用。
 *
 * 玻璃质感来自 CSS（`.checkin-card`），这里只负责状态：
 * 签完后本地先更新一次，避免等 `router.refresh()` 回来才变数字。
 */
/** 未登录时也放一张，让访客知道有这回事；点进登录页即可 */
export function CheckinGuest() {
  return (
    <section className="checkin-card checkin-guest">
      <div className="ck-head">
        <div>
          <div className="ck-kicker">每日签到</div>
          <div className="ck-streak">
            <b>+10</b>
            <span>分起</span>
          </div>
        </div>
        <div className="ck-balance">
          <b>—</b>
          <span>登录后显示</span>
        </div>
      </div>
      <div className="ck-days">
        {Array.from({ length: 7 }).map((_, i) => (
          <i key={i} />
        ))}
      </div>
      <Link href="/login" className="ck-btn" style={{ display: 'grid', placeItems: 'center' }}>
        登录后签到
      </Link>
      <div className="ck-foot">
        <span>连签每天多 1 分，最高 17 分</span>
        <Link href="/points">规则 →</Link>
      </div>
    </section>
  );
}

export function CheckinCard({ initial }: { initial: PointsSnapshot }) {
  const router = useRouter();
  const [snap, setSnap] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sign() {
    if (busy || snap.todayDone) return;
    setBusy(true);
    setMsg(null);

    const res = await fetch('/api/v1/points/checkin', { method: 'POST' }).catch(() => null);
    const payload = (await res?.json().catch(() => null)) as
      | { data?: CheckinResult; message?: string }
      | null;
    setBusy(false);

    if (!res?.ok || !payload?.data) {
      setMsg(payload?.message ?? '签到失败，稍后再试');
      return;
    }

    const r = payload.data;
    setSnap((s) => ({
      ...s,
      points: r.points,
      streak: r.streak,
      todayDone: true,
      todayEarned: r.already ? s.todayEarned : r.earned,
      nextReward: rewardFor(r.streak + 1),
      recentDays: [...s.recentDays.slice(1), true],
      myRank: r.myRank || s.myRank,
    }));
    setMsg(r.already ? '今天已经签过了' : `签到成功，+${r.earned} 积分`);
    router.refresh();
  }

  return (
    <section className="checkin-card">
      <div className="ck-head">
        <div>
          <div className="ck-kicker">每日签到</div>
          <div className="ck-streak">
            <b>{snap.streak}</b>
            <span>天连签</span>
          </div>
        </div>
        <div className="ck-balance">
          <b className="mono">{snap.points}</b>
          <span>我的积分</span>
        </div>
      </div>

      <div className="ck-days" aria-label="最近 7 天签到情况">
        {snap.recentDays.map((on, i) => (
          <i key={i} data-on={on} title={on ? '已签到' : '未签到'} />
        ))}
      </div>

      <button type="button" className="ck-btn" disabled={busy || snap.todayDone} onClick={sign}>
        {snap.todayDone
          ? snap.todayEarned > 0
            ? `今日已签到 +${snap.todayEarned}`
            : '今日已签到'
          : busy
            ? '签到中…'
            : `签到领 ${snap.nextReward} 积分`}
      </button>

      <div className="ck-foot">
        <span>{msg ?? `连签每天多 1 分，第 ${STREAK_BONUS_MAX + 2} 天起封顶 ${CHECKIN_BASE + STREAK_BONUS_MAX} 分`}</span>
        <Link href="/points">明细 →</Link>
      </div>
    </section>
  );
}
