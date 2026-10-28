'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Tournament, TournamentEntry } from '@/lib/task-types';

const ENTRY_LABEL: Record<TournamentEntry['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};

/**
 * 赛事报名。
 *
 * 报名先 pending，后台通过才占名额；被拒可以改资料重新提交（后端会复用同一条）。
 * 这里只做表单与状态展示，不缓存名额——提交后 refresh 让服务端重新算。
 */
export function TournamentSignup({
  tournament,
  myEntry,
  loggedIn,
}: {
  tournament: Tournament;
  myEntry: TournamentEntry | null;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(myEntry?.teamName ?? '');
  const [contact, setContact] = useState(myEntry?.contact ?? '');
  const [note, setNote] = useState(myEntry?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const openSignup = tournament.status === 'signup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/v1/tournaments/${tournament.id}/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamName, contact, note }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '报名失败，稍后再试' });
      return;
    }
    setMsg({ kind: 'ok', text: '已提交，等待审核' });
    setOpen(false);
    router.refresh();
  }

  async function cancel() {
    if (busy) return;
    if (!window.confirm('取消报名？名额会释放给其他人。')) return;
    setBusy(true);
    const res = await fetch(`/api/v1/tournaments/${tournament.id}/signup`, {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '取消失败，稍后再试' });
      return;
    }
    router.refresh();
  }

  if (!loggedIn) {
    return (
      <div className="tn-signup">
        <b>报名参赛</b>
        <p className="small muted">登录后可报名，报名需要填写队伍名称。</p>
        <Link href="/login" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }}>
          去登录
        </Link>
      </div>
    );
  }

  if (myEntry && !open) {
    return (
      <div className="tn-signup">
        <div className="between">
          <b>我的报名</b>
          <span className={'badge ' + (myEntry.status === 'approved' ? 'badge-live' : myEntry.status === 'rejected' ? 'badge-danger' : 'badge-warn')}>
            {ENTRY_LABEL[myEntry.status]}
          </span>
        </div>
        <p className="tn-signup-team">{myEntry.teamName}</p>
        {myEntry.note && <p className="small muted">{myEntry.note}</p>}
        {myEntry.status === 'approved' && (
          <Link href={`/tournaments/${tournament.id}/certificate`} className="tn-signup-cert">
            领取参赛证书
          </Link>
        )}
        {openSignup && (
          <button type="button" className="btn btn-sm btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={cancel} disabled={busy}>
            {busy ? '处理中…' : '取消报名'}
          </button>
        )}
        {msg && <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="tn-signup">
      <div className="between">
        <b>报名参赛</b>
        {myEntry && <span className="badge badge-warn">{ENTRY_LABEL[myEntry.status]}</span>}
      </div>

      {!openSignup ? (
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          {tournament.status === 'draft'
            ? '赛事还没开放报名。'
            : tournament.status === 'signup'
              ? ''
              : '报名已结束，关注赛程与结果。'}
        </p>
      ) : !open ? (
        <>
          <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
            报名后由管理员审核，通过后占用名额。
          </p>
          <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => setOpen(true)}>
            {myEntry ? '重新提交' : '填写报名信息'}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="tn-form">
          <label className="field">
            <span>队伍 / 选手名</span>
            <input
              className="input"
              value={teamName}
              maxLength={24}
              required
              autoFocus
              placeholder="例如：云轨一队"
              onChange={(e) => setTeamName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>联系方式（可空）</span>
            <input
              className="input"
              value={contact}
              maxLength={80}
              placeholder="QQ / 微信 / 邮箱"
              onChange={(e) => setContact(e.target.value)}
            />
          </label>
          <label className="field">
            <span>备注（可空）</span>
            <textarea
              className="input textarea"
              rows={2}
              maxLength={200}
              value={note}
              placeholder="队员名单、时间要求等"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {msg && <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`}>{msg.text}</p>}
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? '提交中…' : '提交报名'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
