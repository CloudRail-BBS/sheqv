'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminUserRow {
  id: string;
  username: string;
  nickname: string;
  role: 'admin' | 'member';
  createdAt: number;
  lastLoginAt?: number;
  notifReadAt?: number;
  banned?: boolean;
}

const day = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : '—');

export function AdminUsers({ items, meId, adminCount }: { items: AdminUserRow[]; meId: string | null; adminCount: number }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setErr(null);
    const res = await fetch('/api/v1/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!res?.ok) {
      setErr(data?.message ?? '操作失败');
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id);
    setErr(null);
    const res = await fetch(`/api/v1/admin/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!res?.ok) {
      setErr(data?.message ?? '删除失败');
      return;
    }
    router.refresh();
  }

  return (
    <>
      {err && (
        <p className="small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
          {err}
        </p>
      )}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>昵称</th>
              <th>用户名</th>
              <th>角色</th>
              <th>注册</th>
              <th>最后登录</th>
              <th>状态</th>
              <th style={{ width: 190 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => {
              const isSelf = u.id === meId;
              const lastAdmin = u.role === 'admin' && !u.banned && adminCount <= 1;
              const locked = isSelf || lastAdmin;
              return (
                <tr key={u.id}>
                  <td>
                    {u.nickname}
                    {isSelf && <span className="badge badge-ghost" style={{ marginLeft: 6 }}>自己</span>}
                  </td>
                  <td className="mono small muted">@{u.username}</td>
                  <td>
                    <span className={'badge ' + (u.role === 'admin' ? 'badge-live' : 'badge-ghost')}>
                      {u.role === 'admin' ? '管理员' : '成员'}
                    </span>
                  </td>
                  <td className="mono small muted">{day(u.createdAt)}</td>
                  <td className="mono small muted">{day(u.lastLoginAt)}</td>
                  <td>
                    <span className={'badge ' + (u.banned ? 'badge-danger' : 'badge-live')}>
                      {u.banned ? '已封禁' : '正常'}
                    </span>
                  </td>
                  <td>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busyId === u.id || locked}
                        title={locked ? '不能修改自己或最后一个管理员' : undefined}
                        onClick={() => patch(u.id, { role: u.role === 'admin' ? 'member' : 'admin' })}
                      >
                        {u.role === 'admin' ? '降为成员' : '设为管理员'}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busyId === u.id || locked}
                        onClick={() => patch(u.id, { banned: !u.banned })}
                      >
                        {u.banned ? '解封' : '封禁'}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busyId === u.id || locked}
                        onClick={() => remove(u.id)}
                        title={locked ? '不能删除自己或最后一个管理员' : undefined}
                      >
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
        规则：不能修改自己的角色、封禁或删除自己；任何操作后必须至少保留一个可用管理员。
        封禁立即生效——该账号的现有会话会被判为无效，不只是隐藏按钮。
      </p>
    </>
  );
}
