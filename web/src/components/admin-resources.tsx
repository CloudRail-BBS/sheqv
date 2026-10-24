'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ResourceView } from '@/lib/resource-types';
import { fmtNum, gameLabel } from '@/lib/resource-types';

/** 后台资源列表：下架 / 恢复 / 删除。不做预审，只做治理。 */
export function AdminResources() {
  const [items, setItems] = useState<ResourceView[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/resources', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg('读取资源失败');
      return;
    }
    const data = (await res.json()) as { items: ResourceView[] };
    setItems(data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: 'published' | 'hidden') {
    setBusy(id);
    const res = await fetch(`/api/v1/admin/resources/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg('操作失败');
      return;
    }
    void load();
  }

  async function remove(id: string) {
    if (!confirm('删除资源不可恢复，确定？')) return;
    setBusy(id);
    const res = await fetch(`/api/v1/admin/resources/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg('删除失败');
      return;
    }
    void load();
  }

  return (
    <>
      {msg && <p className="small auth-err" style={{ marginTop: 10 }}>{msg}</p>}

      <div className="card" style={{ marginTop: 10, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>资源</th>
              <th>游戏</th>
              <th>作者 / 团队</th>
              <th>数据</th>
              <th>状态</th>
              <th style={{ width: 170 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`/resources/${r.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text)' }}>
                    {r.title}
                  </a>
                  <div className="small muted">{r.category}</div>
                </td>
                <td className="small">{gameLabel(r.game)}</td>
                <td className="small">
                  {r.author}
                  {r.teamName && <div className="small muted">{r.teamName}</div>}
                </td>
                <td className="small mono muted">
                  ♥ {fmtNum(r.likeCount)} · ↓ {fmtNum(r.downloadCount)}
                </td>
                <td>
                  <span className={'badge ' + (r.status === 'published' ? 'badge-live' : 'badge-warn')}>
                    {r.status === 'published' ? '已发布' : '已下架'}
                  </span>
                </td>
                <td>
                  <span className="row" style={{ gap: 5 }}>
                    {r.status === 'published' ? (
                      <button className="btn btn-sm btn-ghost" disabled={busy === r.id} onClick={() => setStatus(r.id, 'hidden')}>
                        下架
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-ghost" disabled={busy === r.id} onClick={() => setStatus(r.id, 'published')}>
                        恢复
                      </button>
                    )}
                    <button className="btn btn-sm btn-ghost" disabled={busy === r.id} onClick={() => remove(r.id)}>
                      删除
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="small muted">还没有资源</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
