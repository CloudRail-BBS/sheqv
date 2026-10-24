'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { badgeOf, TITLE_MAX } from '@/lib/badges';
import type { GroupOption } from '@/lib/groups';
import type { UserGroup } from '@/lib/users';
import { UserBadge } from './user-badge';
import { GroupTag } from './group-tag';

export interface AdminUserRow {
  id: string;
  username: string;
  nickname: string;
  role: 'admin' | 'member';
  createdAt: number;
  lastLoginAt?: number;
  notifReadAt?: number;
  banned?: boolean;
  title?: string;
  /** 身份组 id；为空表示未分组 */
  groupId?: string;
  /** 身份组的名字与颜色 */
  group?: UserGroup;
  /** 是否已获得开发者身份 */
  developer?: boolean;
}

const day = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : '—');

export function AdminUsers({
  items,
  meId,
  adminCount,
  groups,
}: {
  items: AdminUserRow[];
  meId: string | null;
  adminCount: number;
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 正在编辑头衔的用户 id */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

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
      return false;
    }
    router.refresh();
    return true;
  }

  async function assignGroup(id: string, groupId: string) {
    setBusyId(id);
    setErr(null);
    const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(id)}/group`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // 空串表示移出身份组，后端要的是显式 null
      body: JSON.stringify({ groupId: groupId || null }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!res?.ok) {
      setErr(data?.message ?? '分配身份组失败');
      return;
    }
    router.refresh();
  }

  async function toggleDeveloper(id: string, next: boolean) {
    setBusyId(id);
    setErr(null);
    const res = await fetch(`/api/v1/admin/users/${id}/developer`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ developer: next }),
    }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      setErr('修改开发者身份失败');
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
              <th style={{ width: 132 }}>身份组</th>
              <th style={{ width: 170 }}>头衔</th>
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
                    <div className="row" style={{ gap: 5, marginTop: 5 }}>
                      {u.developer ? (
                        <span className="dev-chip">开发者</span>
                      ) : (
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ height: 20, fontSize: 10, padding: '0 6px' }}
                          onClick={() => toggleDeveloper(u.id, true)}
                          disabled={busyId === u.id}
                        >
                          设为开发者
                        </button>
                      )}
                      {u.developer && (
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ height: 20, fontSize: 10, padding: '0 6px' }}
                          onClick={() => toggleDeveloper(u.id, false)}
                          disabled={busyId === u.id}
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ marginBottom: 5 }}>
                      {u.group ? (
                        <GroupTag group={u.group} size="sm" />
                      ) : (
                        <span className="small muted">未分组</span>
                      )}
                    </div>
                    <select
                      className="input"
                      style={{ height: 28, width: 118, fontSize: 12, padding: '0 6px' }}
                      value={u.groupId ?? ''}
                      disabled={busyId === u.id || groups.length === 0}
                      title={groups.length === 0 ? '还没有可分配的身份组' : undefined}
                      onChange={(e) => assignGroup(u.id, e.target.value)}
                    >
                      <option value="">未分组</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {editing === u.id ? (
                      <div className="row" style={{ gap: 5 }}>
                        <input
                          className="input"
                          style={{ height: 28, width: 92, fontSize: 12 }}
                          value={draft}
                          maxLength={TITLE_MAX}
                          autoFocus
                          placeholder={u.role === 'admin' ? '管理员' : '选填'}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              patch(u.id, { title: draft.trim() || null }).then((ok) => ok && setEditing(null));
                            }
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                        <button
                          className="btn btn-sm"
                          disabled={busyId === u.id}
                          onClick={() =>
                            patch(u.id, { title: draft.trim() || null }).then((ok) => ok && setEditing(null))
                          }
                        >
                          存
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 6 }}>
                        <UserBadge badge={badgeOf({ role: u.role, title: u.title })} size="sm" />
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => {
                            setEditing(u.id);
                            setDraft(u.title ?? '');
                          }}
                        >
                          {u.title ? '改' : '设置'}
                        </button>
                      </div>
                    )}
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
        头衔留空会回落默认（管理员显示「管理员」，普通用户不显示）。
        「身份组」决定发帖 / 评论等权限，换组后立即生效（管理员不受组限制）；选「未分组」等于收回全部组权限。
        封禁立即生效——该账号的现有会话会被判为无效，不只是隐藏按钮。
      </p>
    </>
  );
}
