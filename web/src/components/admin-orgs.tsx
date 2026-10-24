'use client';

import { useCallback, useEffect, useState } from 'react';
import { gameLabel, type Org } from '@/lib/org-types';

type Draft = { points: string; wins: string; losses: string; members: string };

const toDraft = (o: Org): Draft => ({
  points: String(o.points),
  wins: String(o.wins),
  losses: String(o.losses),
  members: String(o.members),
});

/**
 * 后台：公会 / 战队战绩校准。
 *
 * 比赛系统还没接通，榜单上的分数只能由仲裁在赛后手工落账；
 * 这里就是那个唯一的写入口——负责人自己是改不了的。
 */
export function AdminOrgs() {
  const [guilds, setGuilds] = useState<Org[]>([]);
  const [teams, setTeams] = useState<Org[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/orgs', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { guilds: Org[]; teams: Org[] };
    setGuilds(data.guilds ?? []);
    setTeams(data.teams ?? []);
    setDrafts(
      Object.fromEntries([...(data.guilds ?? []), ...(data.teams ?? [])].map((o) => [o.id, toDraft(o)])),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(id: string, key: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value.replace(/\D/g, '').slice(0, 7) } }));
  }

  async function save(org: Org) {
    const draft = drafts[org.id];
    if (!draft) return;
    setBusy(org.id);
    setMsg(null);
    const res = await fetch(`/api/v1/admin/orgs/${org.kind}/${org.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        points: Number(draft.points || 0),
        wins: Number(draft.wins || 0),
        losses: Number(draft.losses || 0),
        members: Number(draft.members || 0),
      }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: `已更新「${org.name}」` });
    void load();
  }

  async function remove(org: Org) {
    if (!window.confirm(`删除${org.kind === 'guild' ? '公会' : '战队'}「${org.name}」？`)) return;
    setBusy(org.id);
    const res = await fetch(`/api/v1/admin/orgs/${org.kind}/${org.id}`, { method: 'DELETE' }).catch(
      () => null,
    );
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败' });
      return;
    }
    setMsg({ kind: 'ok', text: '已删除' });
    void load();
  }

  if (loading) return <p className="small muted">读取中…</p>;

  if (guilds.length === 0 && teams.length === 0) {
    return (
      <div className="card empty-state">
        <b>还没有公会或战队</b>
        <p>用户在前台创建后会出现在这里。</p>
      </div>
    );
  }

  return (
    <>
      {msg && (
        <p
          className="small"
          style={{ color: msg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)', marginBottom: 8 }}
        >
          {msg.text}
        </p>
      )}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>类型</th>
              <th>名称</th>
              <th>游戏</th>
              <th>负责人</th>
              <th className="num" style={{ width: 82 }}>积分</th>
              <th className="num" style={{ width: 68 }}>胜</th>
              <th className="num" style={{ width: 68 }}>负</th>
              <th className="num" style={{ width: 78 }}>成员</th>
              <th style={{ width: 140 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {[...guilds, ...teams].map((o) => {
              const d = drafts[o.id] ?? toDraft(o);
              return (
                <tr key={o.id}>
                  <td>
                    <span className="badge badge-ghost">{o.kind === 'guild' ? '公会' : '战队'}</span>
                  </td>
                  <td>
                    <b>{o.name}</b>
                    <span className="mono small muted" style={{ marginLeft: 6 }}>
                      {o.tag}
                    </span>
                  </td>
                  <td className="small muted">{gameLabel(o.game)}</td>
                  <td className="small muted">{o.owner || '—'}</td>
                  {(['points', 'wins', 'losses', 'members'] as const).map((key) => (
                    <td key={key} className="num">
                      <input
                        className="input"
                        style={{ height: 26, width: 64, fontSize: 12, textAlign: 'right', padding: '0 6px' }}
                        inputMode="numeric"
                        value={d[key]}
                        onChange={(e) => edit(o.id, key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <div className="row" style={{ gap: 5 }}>
                      <button className="btn btn-sm btn-ghost" disabled={busy === o.id} onClick={() => save(o)}>
                        保存
                      </button>
                      <button className="btn btn-sm btn-ghost" disabled={busy === o.id} onClick={() => remove(o)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
        积分决定排名（同分看胜场、再看负场）；榜单每次读取都重排，不需要手动刷新缓存。
        改名或换游戏请让负责人在前台重建——游戏所属创建后不可改。
      </p>
    </>
  );
}
