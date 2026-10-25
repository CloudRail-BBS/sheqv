'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RESOURCE_CATEGORIES, RESOURCE_GAMES, RESOURCE_LICENSES } from '@/lib/resource-types';
import { MarkdownEditor } from './markdown-editor';

interface TeamOption {
  id: string;
  name: string;
  tag: string;
}

const EMPTY = {
  title: '',
  summary: '',
  body: '',
  game: 'minecraft',
  category: '地图',
  tags: '',
  teamId: '',
  url: '',
  version: '',
  license: '作者保留',
  sizeMb: '',
};

/**
 * 发布资源：与发帖共用一个悬浮弹窗外壳。
 *
 * 资源专属字段（游戏/分类/下载地址/版本/授权/团队）放在头部与元信息区，
 * 详细介绍沿用 Markdown 编辑器与底部工具栏；发布成功直接进详情页。
 */
export function ResourceUpload({
  teams,
  nickname,
  avatar,
  defaultOpen = false,
  triggerLabel = '发布资源',
}: {
  teams: TeamOption[];
  nickname: string;
  avatar?: string;
  defaultOpen?: boolean;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy]);

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function close() {
    if (defaultOpen) {
      router.push('/resources');
      return;
    }
    setOpen(false);
  }

  async function submit() {
    if (busy) return;
    setErr(null);
    const title = form.title.trim();
    const url = form.url.trim();
    if (title.length < 2 || title.length > 60) {
      setErr('标题需为 2–60 字');
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setErr('请填写 http/https 下载地址');
      return;
    }
    const body = form.body.trim();
    if (body.length > 5000) {
      setErr('详细介绍不超过 5000 字');
      return;
    }

    const tags = form.tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6);
    const sizeMb = Number(form.sizeMb);
    setBusy(true);
    const res = await fetch('/api/v1/resources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        summary: form.summary.trim(),
        body,
        game: form.game,
        category: form.category,
        tags,
        teamId: form.teamId || null,
        url,
        version: form.version.trim(),
        license: form.license,
        sizeBytes: Number.isFinite(sizeMb) && sizeMb > 0 ? Math.round(sizeMb * 1024 * 1024) : 0,
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { item?: { id: string }; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.item) {
      setErr(data?.message ?? '发布失败，稍后再试');
      return;
    }
    router.push(`/resources/${data.item.id}`);
    router.refresh();
  }

  const avatarNode = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt="" />
  ) : (
    nickname.slice(0, 1)
  );

  return (
    <>
      {!defaultOpen && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          {triggerLabel}
        </button>
      )}

      {open && (
        <div className="composer-modal" role="dialog" aria-modal="true" aria-label="发布资源">
          <button
            type="button"
            className="composer-backdrop"
            aria-label="关闭编辑器"
            onClick={() => !busy && close()}
          />
          <div className={'composer-panel' + (expanded ? ' is-expanded' : '')}>
            <div className="composer-panel-head">
              <span className="composer-head-icon" aria-hidden="true">
                ⬆
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b className="composer-head-title">发布资源</b>
                <div className="composer-head-sub">
                  以 {nickname} 的身份发布 · 第一个资源会自动获得开发者身份
                </div>
              </div>
              <div className="composer-head-actions">
                <button
                  type="button"
                  className="composer-icon-btn"
                  aria-label={expanded ? '还原大小' : '放大编辑'}
                  title={expanded ? '还原大小' : '放大编辑'}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? '⤡' : '⤢'}
                </button>
                <button
                  type="button"
                  className="composer-icon-btn"
                  aria-label="关闭"
                  onClick={() => !busy && close()}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="composer-meta res-composer-meta">
              <label className="composer-cat">
                <span className="composer-meta-label">游戏</span>
                <select className="composer-select" value={form.game} onChange={(e) => set('game', e.target.value)}>
                  {RESOURCE_GAMES.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </label>
              <div className="res-meta-grid">
                <label className="field">
                  <span>分类</span>
                  <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {RESOURCE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>版本</span>
                  <input className="input" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="1.0.0" maxLength={24} />
                </label>
                <label className="field">
                  <span>授权</span>
                  <select className="input" value={form.license} onChange={(e) => set('license', e.target.value)}>
                    {RESOURCE_LICENSES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>大小（MB）</span>
                  <input
                    className="input"
                    value={form.sizeMb}
                    onChange={(e) => set('sizeMb', e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="12.5"
                  />
                </label>
              </div>
            </div>

            <input
              className="composer-title-input"
              placeholder="资源名称，例如：云轨红石工具箱"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={60}
              autoFocus
            />

            <div className="res-composer-extra">
              <label className="field">
                <span>一句话简介</span>
                <input
                  className="input"
                  value={form.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  placeholder="这个资源解决什么问题，适合谁"
                  maxLength={200}
                />
              </label>
              <label className="field">
                <span>下载地址</span>
                <input
                  className="input mono"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://…/resource.zip"
                />
              </label>
              <label className="field">
                <span>标签（逗号分隔，最多 6 个）</span>
                <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="红石, 模板, 1.20" />
              </label>
              <label className="field">
                <span>以团队名义发布</span>
                <select className="input" value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
                  <option value="">个人名义</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{t.tag}）</option>
                  ))}
                </select>
              </label>
            </div>

            <MarkdownEditor
              variant="composer"
              value={form.body}
              onChange={(v) => set('body', v)}
              rows={10}
              maxLength={5000}
              placeholder="安装方式、依赖、已知问题…… 支持 Markdown 与图片。"
              onSubmit={submit}
              leading={
                <span className="composer-me">
                  <span className="composer-me-avatar">{avatarNode}</span>
                  <b>ME</b>
                </span>
              }
              actions={
                <>
                  <span className="composer-count">{form.body.length} 字</span>
                  {err ? (
                    <span className="composer-err">{err}</span>
                  ) : (
                    <span className="composer-saved">发布后立即可见</span>
                  )}
                  <button type="button" className="composer-discard" onClick={close} disabled={busy}>
                    舍弃
                  </button>
                  <button type="button" className="composer-submit" onClick={submit} disabled={busy}>
                    {busy ? '发布中…' : '发布资源'}
                  </button>
                </>
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
