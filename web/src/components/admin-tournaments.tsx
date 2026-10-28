'use client';

import { useCallback, useEffect, useState } from 'react';
import { TournamentStatusBadge } from './tournament-status';
import {
  TOURNAMENT_STATUS_LABEL,
  fmtDay,
  type Tournament,
  type TournamentEntry,
  type TournamentStatus,
} from '@/lib/task-types';

const EMPTY = {
  id: '',
  title: '',
  game: 'minecraft',
  mode: '5v5',
  summary: '',
  body: '',
  cover: '',
  prize: '',
  hostName: '',
  status: 'draft' as TournamentStatus,
  signupStart: '',
  signupEnd: '',
  startAt: '',
  endAt: '',
  maxEntries: 0,
};

type Form = typeof EMPTY;

const GAMES = [
  { key: 'minecraft', label: '我的世界' },
  { key: 'rusted_warfare', label: 'Rusted Warfare' },
];

const STATUSES: TournamentStatus[] = ['draft', 'signup', 'running', 'ended'];

/** 时间戳 → datetime-local 的本地值 */
function toLocal(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fromItem(t: Tournament): Form {
  return {
    id: t.id,
    title: t.title,
    game: t.game,
    mode: t.mode,
    summary: t.summary,
    body: t.body ?? '',
    cover: t.cover,
    prize: t.prize,
    hostName: t.hostName ?? '',
    status: t.status,
    signupStart: toLocal(t.signupStart),
    signupEnd: toLocal(t.signupEnd),
    startAt: toLocal(t.startAt),
    endAt: toLocal(t.endAt),
    maxEntries: t.maxEntries,
  };
}

export function AdminTournaments({ adminUserId }: { adminUserId: string }) {
  const [items, setItems] = useState<Tournament[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [entriesFor, setEntriesFor] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/tournaments', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: Tournament[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadEntries = useCallback(async (t: Tournament) => {
    setEntriesFor(t);
    setEntries([]);
    const res = await fetch(`/api/v1/admin/tournaments/${t.id}/entries`, { cache: 'no-store' }).catch(
      () => null,
    );
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取报名失败' });
      return;
    }
    const data = (await res.json()) as { items: TournamentEntry[] };
    setEntries(data.items ?? []);
  }, []);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const editing = Boolean(form.id);
    const res = await fetch(
      editing ? `/api/v1/admin/tournaments/${form.id}` : '/api/v1/admin/tournaments',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          game: form.game,
          mode: form.mode,
          summary: form.summary,
          body: form.body,
          cover: form.cover,
          prize: form.prize,
          hostName: form.hostName,
          status: form.status,
          maxEntries: form.maxEntries,
          signupStart: toIso(form.signupStart),
          signupEnd: toIso(form.signupEnd),
          startAt: toIso(form.startAt),
          endAt: toIso(form.endAt),
        }),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: editing ? '已保存' : '已创建' });
    setForm(EMPTY);
    void load();
  }

  async function remove(t: Tournament) {
    if (!window.confirm(`删除赛事「${t.title}」？报名记录会一起删除。`)) return;
    setBusy(true);
    const res = await fetch(`/api/v1/admin/tournaments/${t.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败' });
      return;
    }
    if (form.id === t.id) setForm(EMPTY);
    if (entriesFor?.id === t.id) setEntriesFor(null);
    void load();
  }

  /** 老赛事可能没有主办账号，认领后即可领主办证书 */
  async function claimHost(t: Tournament) {
    if (!adminUserId) {
      setMsg({ kind: 'err', text: '口令通道没有账号，无法认领' });
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/v1/admin/tournaments/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hostUserId: adminUserId }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '认领失败' });
      return;
    }
    setMsg({ kind: 'ok', text: '已把你设为这场赛事的主办' });
    void load();
  }

  async function review(entry: TournamentEntry, status: TournamentEntry['status']) {
    const res = await fetch(`/api/v1/admin/tournaments/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '审核失败' });
      return;
    }
    if (entriesFor) void loadEntries(entriesFor);
    void load();
  }

  return (
    <>
      <div className="card card-pad">
        <div className="between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 13.5 }}>{form.id ? '编辑赛事' : '新建赛事'}</b>
          {form.id && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm(EMPTY)}>
              取消编辑
            </button>
          )}
        </div>

        <div className="adm-grid2">
          <label className="field">
            <span>赛事名称</span>
            <input className="input" value={form.title} maxLength={60} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="field">
            <span>状态</span>
            <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as TournamentStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{TOURNAMENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>游戏</span>
            <select className="input" value={form.game} onChange={(e) => set('game', e.target.value)}>
              {GAMES.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>赛制</span>
            <input className="input" value={form.mode} maxLength={24} placeholder="5v5 / 单败淘汰" onChange={(e) => set('mode', e.target.value)} />
          </label>
          <label className="field">
            <span>报名开始</span>
            <input className="input" type="datetime-local" value={form.signupStart} onChange={(e) => set('signupStart', e.target.value)} />
          </label>
          <label className="field">
            <span>报名截止</span>
            <input className="input" type="datetime-local" value={form.signupEnd} onChange={(e) => set('signupEnd', e.target.value)} />
          </label>
          <label className="field">
            <span>比赛开始</span>
            <input className="input" type="datetime-local" value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </label>
          <label className="field">
            <span>比赛结束</span>
            <input className="input" type="datetime-local" value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
          </label>
          <label className="field">
            <span>主办方名称（可空，默认站点名）</span>
            <input
              className="input"
              value={form.hostName}
              maxLength={40}
              placeholder="例如：云轨社区运营组"
              onChange={(e) => set('hostName', e.target.value)}
            />
          </label>
          <label className="field">
            <span>名额（0 = 不限）</span>
            <input className="input" value={String(form.maxEntries)} inputMode="numeric" onChange={(e) => set('maxEntries', Number(e.target.value.replace(/\D/g, '')) || 0)} />
          </label>
          <label className="field">
            <span>封面地址（可空）</span>
            <input className="input mono" value={form.cover} placeholder="https://…" onChange={(e) => set('cover', e.target.value)} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>简介</span>
            <input className="input" value={form.summary} maxLength={200} onChange={(e) => set('summary', e.target.value)} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>奖品说明</span>
            <input className="input" value={form.prize} maxLength={300} placeholder="冠军：… 亚军：…" onChange={(e) => set('prize', e.target.value)} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>赛程说明（Markdown）</span>
            <textarea className="input textarea" rows={5} value={form.body} onChange={(e) => set('body', e.target.value)} />
          </label>
        </div>

        {msg && (
          <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`} style={{ marginTop: 8 }}>
            {msg.text}
          </p>
        )}

        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || form.title.trim().length < 2}>
            {busy ? '保存中…' : form.id ? '保存修改' : '创建赛事'}
          </button>
          <span className="small muted">草稿不会出现在前台；开放报名后用户才能提交。</span>
        </div>
      </div>

      {loading ? (
        <p className="small muted" style={{ marginTop: 12 }}>读取中…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state" style={{ marginTop: 12 }}>
          <b>还没有赛事</b>
          <p>上面的表单创建后会出现在 /tournaments。</p>
        </div>
      ) : (
        <div className="card table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>赛事</th>
                <th>状态</th>
                <th>报名</th>
                <th>开赛</th>
                <th>队伍</th>
                <th style={{ width: 270 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="small muted">
                      {t.game === 'minecraft' ? '我的世界' : 'Rusted Warfare'} · {t.mode}
                      {t.hostName ? ` · ${t.hostName}` : ''}
                    </div>
                  </td>
                  <td>
                    <TournamentStatusBadge status={t.status} />
                  </td>
                  <td className="small mono">{fmtDay(t.signupEnd)}</td>
                  <td className="small mono">{fmtDay(t.startAt)}</td>
                  <td className="mono small">{t.entryCount}{t.maxEntries > 0 ? ` / ${t.maxEntries}` : ''}</td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => setForm(fromItem(t))}>
                        编辑
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => void loadEntries(t)}>
                        报名
                      </button>
                      {adminUserId && t.hostUserId !== adminUserId && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost adm-mini"
                          onClick={() => void claimHost(t)}
                          disabled={busy}
                          title="把这场的证书发给你的账号"
                        >
                          认领主办
                        </button>
                      )}
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => remove(t)} disabled={busy}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entriesFor && (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 13.5 }}>{entriesFor.title} · 报名审核</b>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEntriesFor(null)}>
              收起
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="small muted">还没有人报名。</p>
          ) : (
            <div className="tn-admin-entries">
              {entries.map((e) => (
                <div key={e.id} className="tn-admin-row">
                  <span className={'badge ' + (e.status === 'approved' ? 'badge-live' : e.status === 'rejected' ? 'badge-danger' : 'badge-warn')}>
                    {e.status === 'approved' ? '已通过' : e.status === 'rejected' ? '未通过' : '待审核'}
                  </span>
                  <span className="tn-admin-team">{e.teamName}</span>
                  <span className="small muted">@{e.nickname}</span>
                  {e.contact && <span className="small muted mono">{e.contact}</span>}
                  {e.note && <span className="small muted tn-admin-note">{e.note}</span>}
                  <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                    {e.status !== 'approved' && (
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => review(e, 'approved')}>
                        通过
                      </button>
                    )}
                    {e.status !== 'rejected' && (
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => review(e, 'rejected')}>
                        拒绝
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
