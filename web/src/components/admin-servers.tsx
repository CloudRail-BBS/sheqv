'use client';

import { useCallback, useEffect, useState } from 'react';
import { STATE_LABEL, STATUS_LABEL, addressOf, type GameServer, type ServerStatus } from '@/lib/server-types';

/**
 * 后台的联机大厅列表。
 *
 * 上传先进审核队列：**通过**才进大厅，**拒绝**留在后台；另外还有
 * **隐藏**（已通过但暂时下架）和**删除**。探测结果是只读的。
 */
export function AdminServers() {
  const [items, setItems] = useState<GameServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/servers', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: GameServer[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: ServerStatus) {
    setBusy(id);
    const res = await fetch(`/api/v1/admin/servers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '操作失败' });
      return;
    }
    setMsg({
      kind: 'ok',
      text: status === 'approved' ? '已通过，下一轮会开始探测' : '已拒绝，前台不可见',
    });
    void load();
  }

  async function setVisibility(id: string, visibility: 'public' | 'hidden') {
    setBusy(id);
    const res = await fetch(`/api/v1/admin/servers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '操作失败' });
      return;
    }
    setMsg({ kind: 'ok', text: visibility === 'hidden' ? '已隐藏' : '已恢复展示' });
    void load();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`删除「${name}」？用户需要重新上传。`)) return;
    setBusy(id);
    const res = await fetch(`/api/v1/admin/servers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败' });
      return;
    }
    setMsg({ kind: 'ok', text: '已删除' });
    void load();
  }

  if (loading) {
    return <p className="small muted">读取中…</p>;
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

      {items.length === 0 ? (
        <div className="card empty-state">
          <b>还没有人上传</b>
          <p>前台 /servers 上传后会出现在这里。</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>地址</th>
                <th>状态</th>
                <th>上传者</th>
                <th>审核</th>
                <th>可见性</th>
                <th style={{ width: 232 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="badge badge-ghost">
                      {s.kind === 'minecraft' ? '我的世界' : 'Rusted Warfare'}
                    </span>
                  </td>
                  <td>{s.name}</td>
                  <td className="mono small muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {addressOf(s)}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <i className="dot" data-state={s.probeState} />
                      <span className="small">{STATE_LABEL[s.probeState]}</span>
                      {s.probeState === 'online' && s.kind === 'minecraft' && (
                        <span className="mono small muted">
                          {s.playersOnline}/{s.playersMax || '—'}
                        </span>
                      )}
                      {s.probeState === 'online' && s.kind === 'rusted_warfare' && (
                        <span className="mono small muted">{s.versionName}</span>
                      )}
                    </span>
                  </td>
                  <td className="small muted">{s.owner || '—'}</td>
                  <td>
                    <span
                      className={
                        'badge ' +
                        (s.status === 'approved'
                          ? 'badge-live'
                          : s.status === 'rejected'
                            ? 'badge-danger'
                            : 'badge-warn')
                      }
                    >
                      {STATUS_LABEL[s.status] ?? '未标记'}
                    </span>
                  </td>
                  <td>
                    <span className={'badge ' + (s.visibility === 'public' ? 'badge-live' : 'badge-ghost')}>
                      {s.visibility === 'public' ? '展示中' : '已隐藏'}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      {s.status !== 'approved' && (
                        <button
                          className="btn btn-sm btn-ghost adm-mini"
                          disabled={busy === s.id}
                          onClick={() => setStatus(s.id, 'approved')}
                        >
                          通过
                        </button>
                      )}
                      {s.status !== 'rejected' && (
                        <button
                          className="btn btn-sm btn-ghost adm-mini"
                          disabled={busy === s.id}
                          onClick={() => setStatus(s.id, 'rejected')}
                        >
                          拒绝
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-ghost adm-mini"
                        disabled={busy === s.id}
                        onClick={() => setVisibility(s.id, s.visibility === 'public' ? 'hidden' : 'public')}
                      >
                        {s.visibility === 'public' ? '隐藏' : '恢复'}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost adm-mini"
                        disabled={busy === s.id}
                        onClick={() => remove(s.id, s.name)}
                      >
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

      <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
        探测由后台按 <code>SERVER_PROBE_SECS</code>（默认 60 秒）轮转执行，不在请求里做。
        隐藏的条目会停止探测（省资源），恢复展示后下一轮就会刷新。
      </p>
    </>
  );
}
