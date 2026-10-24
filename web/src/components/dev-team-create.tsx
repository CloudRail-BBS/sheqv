'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DEV_TEAM_GAMES } from '@/lib/dev-team-types';

/**
 * 建队表单。
 *
 * 只有开发者能建：后端会再判一次（前端只是提前把入口收起来）。
 * 一个账号只能负责一个团队，所以创建成功后直接跳详情。
 */
export function DevTeamCreate({
  isDeveloper,
  ownsTeam,
}: {
  isDeveloper: boolean;
  /** 已经负责一个团队时不再显示创建入口 */
  ownsTeam?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0ea5e9');
  const [game, setGame] = useState('minecraft');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (ownsTeam) {
    return (
      <div className="card card-pad dt-create">
        <div className="between">
          <div>
            <h3 style={{ fontSize: 14 }}>你正在负责「{ownsTeam.name}」</h3>
            <p className="small muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
              一个账号只能负责一个开发团队。团队成员可以以团队名义发布资源。
            </p>
          </div>
          <Link href={`/dev-teams/${ownsTeam.id}`} className="btn btn-sm btn-ghost">
            进入团队 →
          </Link>
        </div>
      </div>
    );
  }

  if (!isDeveloper) {
    return (
      <div className="card card-pad dt-create">
        <h3 style={{ fontSize: 14 }}>还没有开发者身份？</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
          发布第一个资源后自动获得开发者身份，之后就能创建开发团队、把作品挂在团队名下。
        </p>
        <Link href="/resources/new" className="btn btn-sm btn-primary" style={{ marginTop: 10 }}>
          去发布第一个资源
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    const res = await fetch('/api/v1/dev-teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, tag, description, color, game }),
    }).catch(() => null);

    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setErr(data?.message ?? '创建失败');
      return;
    }
    const data = (await res.json()) as { item: { id: string } };
    router.push(`/dev-teams/${data.item.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="card card-pad dt-create">
        <div className="between">
          <div>
            <h3 style={{ fontSize: 14 }}>创建开发团队</h3>
            <p className="small muted" style={{ marginTop: 4 }}>
              面向资源作者：成员共同维护作品，团队单独上开发者榜。
            </p>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
            开始创建
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card card-pad dt-create" onSubmit={submit}>
      <div className="between" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 14 }}>创建开发团队</h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
          收起
        </button>
      </div>

      <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field">
          <span>团队名</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        </label>
        <label className="field">
          <span>简称（2–8 字）</span>
          <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={8} required />
        </label>
        <label className="field">
          <span>主攻游戏</span>
          <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
            {DEV_TEAM_GAMES.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>标识颜色</span>
          <input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#0ea5e9" />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>简介</span>
          <textarea
            className="input textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="你们做什么类型的资源，擅长什么"
            maxLength={300}
          />
        </label>
      </div>

      {err && <p className="small auth-err" style={{ marginTop: 8 }}>{err}</p>}

      <button className="btn btn-primary btn-sm" type="submit" disabled={busy} style={{ marginTop: 12 }}>
        {busy ? '创建中…' : '创建团队'}
      </button>
      <p className="small muted" style={{ marginTop: 8 }}>一个账号只能负责一个团队；成员必须是开发者。</p>
    </form>
  );
}
