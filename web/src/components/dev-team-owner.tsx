'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DevMember } from '@/lib/dev-team-types';
import { DevTeamAvatar } from './dev-team-avatar';

/**
 * 负责人面板：加人 / 移除 / 解散。
 *
 * 服务端只认同一个人（owner 或管理员），这里不重复做权限判断，
 * 只把「谁能点」先收起来。
 */
export function DevTeamOwner({
  teamId,
  members,
  logo,
  tag,
  color,
}: {
  teamId: string;
  members: DevMember[];
  logo?: string;
  tag?: string;
  color?: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [logoDraft, setLogoDraft] = useState(logo ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function request(path: string, init: RequestInit, key: string) {
    setBusy(key);
    setMsg(null);
    const res = await fetch(path, init).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '操作失败' });
      return null;
    }
    router.refresh();
    return res;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    const res = await request(
      `/api/v1/dev-teams/${teamId}/members`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      },
      'add',
    );
    if (res) {
      setNickname('');
      setMsg({ kind: 'ok', text: '已加入团队' });
    }
  }

  async function remove(userId: string) {
    if (!confirm('把这个成员移出团队？')) return;
    const res = await request(`/api/v1/dev-teams/${teamId}/members/${userId}`, { method: 'DELETE' }, userId);
    if (res) setMsg({ kind: 'ok', text: '已移除' });
  }

  async function saveLogo() {
    const res = await request(
      `/api/v1/dev-teams/${teamId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logo: logoDraft.trim() }),
      },
      'logo',
    );
    if (res) setMsg({ kind: 'ok', text: logoDraft.trim() ? '头像已更新' : '已恢复简称色块' });
  }

  async function destroy() {
    if (!confirm('解散团队？团队名下的资源会保留，但不再属于任何团队。')) return;
    const res = await request(`/api/v1/dev-teams/${teamId}`, { method: 'DELETE' }, 'destroy');
    if (res) {
      router.push('/dev-teams');
      router.refresh();
    }
  }

  return (
    <div className="card rail-card">
      <div className="rail-title">负责人操作</div>

      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <DevTeamAvatar
          team={{
            name: '团队',
            tag: tag || 'TAG',
            color: color || '#3e7cff',
            logo: logoDraft.trim(),
          }}
          size={34}
        />
        <input
          className="input mono"
          value={logoDraft}
          onChange={(e) => setLogoDraft(e.target.value)}
          placeholder="/logo.png 或 https://…"
          style={{ height: 32, fontSize: 11, flex: 1 }}
        />
        <button className="btn btn-sm btn-ghost" onClick={saveLogo} disabled={busy === 'logo'}>
          保存
        </button>
      </div>
      <p className="small muted" style={{ marginBottom: 10, lineHeight: 1.6 }}>
        头像为空时用简称色块；分享图只加载站内图片。
      </p>

      <form onSubmit={add} className="row" style={{ gap: 6 }}>
        <input
          className="input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="成员昵称或 @用户名"
          style={{ height: 32, fontSize: 12 }}
        />
        <button className="btn btn-sm btn-primary" type="submit" disabled={busy === 'add'}>
          加入
        </button>
      </form>
      <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
        对方必须已经是开发者（发布过资源）。
      </p>

      {members.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div className="rail-title" style={{ marginBottom: 6 }}>成员</div>
          {members
            .filter((m) => m.role !== 'owner')
            .map((m) => (
              <div key={m.userId} className="between" style={{ padding: '5px 0' }}>
                <span className="small">{m.nickname}</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => remove(m.userId)}
                  disabled={busy === m.userId}
                >
                  移除
                </button>
              </div>
            ))}
        </div>
      )}

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 8 }}>
          {msg.text}
        </p>
      )}

      <button className="btn btn-sm btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={destroy} disabled={busy === 'destroy'}>
        解散团队
      </button>
    </div>
  );
}
