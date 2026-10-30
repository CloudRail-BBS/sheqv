'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GAMES, KIND_LABEL, type OrgKind } from '@/lib/org-types';

/**
 * 创建公会 / 战队。
 *
 * 和发帖、上传服务器一样是**悬浮窗**：列表页右上角的按钮触发，Portal 到 body，
 * 锁滚动、Esc / 点遮罩关闭，宽度比发帖窗窄（字段少，不需要整屏）。
 *
 * 两者字段完全一样，但**是两个独立入口**：建公会不等于建战队，
 * 一个账号可以各有一个（后端用唯一索引兜底）。
 */
export function OrgCreate({ kind, loggedIn }: { kind: OrgKind; loggedIn: boolean }) {
  const router = useRouter();
  const label = KIND_LABEL[kind];

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [game, setGame] = useState(GAMES[0].key);
  const [intro, setIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy]);

  function close() {
    if (busy) return;
    setOpen(false);
    setMsg(null);
  }

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
      <Link href="/login" className="btn btn-sm btn-ghost">
        登录后创建
      </Link>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        创建{label}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="composer-modal" role="dialog" aria-modal="true" aria-label={`创建${label}`}>
            <button type="button" className="composer-backdrop" aria-label="关闭" onClick={close} />
            <form className="composer-panel org-modal" onSubmit={submit}>
              <div className="composer-panel-head">
                <span className="composer-head-icon" aria-hidden="true">
                  {kind === 'guild' ? (
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M12 3 4 7v5c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V7z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="composer-head-title">创建{label}</b>
                  <div className="composer-head-sub">
                    游戏所属创建后不可更改，名称与简称在同一游戏内不能重复
                  </div>
                </div>
                <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={close}>
                  ×
                </button>
              </div>

              <div className="org-form-grid">
                <label className="field">
                  名称
                  <input
                    className="input"
                    value={name}
                    maxLength={20}
                    placeholder={kind === 'guild' ? '例如：星轨联萌' : '例如：星轨一队'}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </label>
                <label className="field">
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
                <label className="field" style={{ gridColumn: '1 / -1' }}>
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
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  简介
                  <textarea
                    className="input textarea"
                    rows={4}
                    maxLength={200}
                    value={intro}
                    placeholder="风格、活跃时段、招募要求……"
                    onChange={(e) => setIntro(e.target.value)}
                  />
                </label>
              </div>

              {msg && (
                <p className="small" style={{ marginTop: 10, color: 'var(--danger)' }}>
                  {msg.text}
                </p>
              )}

              <div className="composer-modal-foot">
                <span className="tip">{intro.length} / 200</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={close} disabled={busy}>
                  取消
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                  {busy ? '创建中…' : `创建${label}`}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
