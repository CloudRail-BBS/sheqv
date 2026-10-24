'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GAMES, KIND_LABEL, type OrgKind } from '@/lib/org-types';

/**
 * 创建公会 / 战队的表单。
 *
 * 两者字段完全一样，但**是两个独立入口**：建公会不等于建战队，
 * 一个账号可以各有一个（后端用唯一索引兜底）。
 */
export function OrgCreate({ kind, loggedIn }: { kind: OrgKind; loggedIn: boolean }) {
  const router = useRouter();
  const label = KIND_LABEL[kind];
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [game, setGame] = useState(GAMES[0].key);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);

    const path = kind === 'guild' ? '/api/v1/guilds' : '/api/v1/teams';
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), tag: tag.trim(), game, intro: intro.trim() }),
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as {
      message?: string;
      item?: { id: string };
    } | null;
    setBusy(false);

    if (!res?.ok || !data?.item) {
      setMsg({ kind: 'err', text: data?.message ?? '创建失败，稍后再试' });
      return;
    }
    // 创建成功直接进详情页：负责人下一步通常是导出证书或分享图
    router.push(`/${kind}s/${data.item.id}`);
    router.refresh();
  }

  if (!loggedIn) {
    return (
      <div className="card rail-card">
        <div className="rail-title">创建{label}</div>
        <p className="small muted" style={{ lineHeight: 1.8 }}>
          登录后可以创建自己的{label}，成为负责人并拿到证书。
        </p>
        <Link href="/login" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 12 }}>
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form className="card rail-card" onSubmit={submit}>
      <div className="rail-title">创建{label}</div>

      <label className="field">
        名称
        <input
          className="input"
          value={name}
          maxLength={20}
          placeholder={kind === 'guild' ? '例如：星轨联萌' : '例如：星轨一队'}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <label className="field" style={{ flex: 1 }}>
          简称
          <input
            className="input"
            value={tag}
            maxLength={4}
            placeholder="2–4 字"
            onChange={(e) => setTag(e.target.value)}
            required
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          游戏所属
          <select
            className="input"
            value={game}
            onChange={(e) => setGame(e.target.value as typeof game)}
          >
            {GAMES.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field" style={{ marginTop: 10 }}>
        简介
        <textarea
          className="input textarea"
          rows={3}
          maxLength={200}
          value={intro}
          placeholder="风格、活跃时段、招募要求……"
          onChange={(e) => setIntro(e.target.value)}
        />
      </label>

      {msg && (
        <p
          className="small"
          style={{ marginTop: 10, color: msg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)' }}
        >
          {msg.text}
        </p>
      )}

      <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
        {busy ? '创建中…' : `创建${label}`}
      </button>
      <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
        游戏所属创建后不可更改；名称与简称在同一游戏内不能重复。
      </p>
    </form>
  );
}
