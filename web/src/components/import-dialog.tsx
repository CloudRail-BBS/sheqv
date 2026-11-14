'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { ContentCategory } from '@/lib/category-types';
import { MarkdownEditor } from './markdown-editor';
import type { RemoteItem } from './remote-discover';

/**
 * 收录前编辑。
 *
 * 以前点外站卡片就立刻入库，标题、简介、封面都是原站原样；
 * 现在先弹这张表单：默认填好原站信息（标题 / 简介 / 封面 / 标签 / 版本），
 * 管理员确认或改完再收录，入库的就是改过的内容。
 */
export function ImportDialog({
  item,
  categories,
  onClose,
}: {
  item: RemoteItem;
  categories: ContentCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: item.title,
    summary: item.summary,
    body: '',
    cover: item.icon,
    tags: '',
    gameVersions: '',
    loaders: '',
    category: categories[0]?.key ?? '',
  });

  useEffect(() => setMounted(true), []);

  // 详情比搜索多出正文 / 版本 / 加载器 / 标签：拉一次补进表单，拉不到就用搜索那行信息
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/v1/resources/remote/${encodeURIComponent(item.source)}/${encodeURIComponent(item.sourceId)}`,
      ).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | {
            detail?: {
              summary?: string;
              body?: string;
              icon?: string;
              tags?: string[];
              game_versions?: string;
              loaders?: string;
            };
          }
        | null;
      if (cancelled) return;
      setLoading(false);
      const d = data?.detail;
      if (!d) return;
      setForm((f) => ({
        ...f,
        summary: f.summary || d.summary || '',
        body: d.body || '',
        cover: f.cover || d.icon || '',
        tags: (d.tags ?? []).join(', '),
        gameVersions: d.game_versions ?? '',
        loaders: d.loaders ?? '',
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [item.source, item.sourceId]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (busy) return;
    const title = form.title.trim();
    if (title.length < 2 || title.length > 60) {
      setErr('标题需为 2–60 字');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/v1/resources/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...item,
        title,
        summary: form.summary.trim(),
        body: form.body.trim(),
        cover: form.cover.trim(),
        category: form.category,
        tags: form.tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 6),
        gameVersions: form.gameVersions.trim(),
        loaders: form.loaders.trim(),
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; id?: string; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.id) {
      setErr(data?.message ?? '收录失败，稍后再试');
      return;
    }
    onClose();
    router.push(`/resources/${data.id}`);
    router.refresh();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="composer-modal" role="dialog" aria-modal="true" aria-label="收录外部资源">
      <button type="button" className="composer-backdrop" aria-label="关闭" onClick={() => !busy && onClose()} />
      <div className="composer-panel res-import-panel">
        <div className="composer-panel-head">
          <div>
            <b className="composer-head-title">收录到资源库</b>
            <div className="composer-head-sub">
              来自 {item.source === 'rtsbox' ? 'rtsbox' : item.source === 'curseforge' ? 'CurseForge' : 'Modrinth'}
              {loading ? ' · 正在补全详情…' : ' · 内容可以直接改'}
            </div>
          </div>
          <div className="composer-head-actions">
            <button type="button" className="composer-icon-btn" onClick={() => !busy && onClose()} aria-label="关闭">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="res-import-body">
          <label className="field">
            <span>标题</span>
            <input
              className="input"
              value={form.title}
              maxLength={60}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <div className="res-import-row">
            <label className="field">
              <span>分类</span>
              <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>标签（逗号分隔，最多 6 个）</span>
              <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>一句话简介</span>
            <input
              className="input"
              value={form.summary}
              maxLength={200}
              onChange={(e) => set('summary', e.target.value)}
            />
          </label>
          <label className="field">
            <span>封面地址（留空用原站图标）</span>
            <input className="input" value={form.cover} onChange={(e) => set('cover', e.target.value)} />
          </label>
          <div className="res-import-row">
            <label className="field">
              <span>支持版本</span>
              <input className="input" value={form.gameVersions} onChange={(e) => set('gameVersions', e.target.value)} />
            </label>
            <label className="field">
              <span>加载器</span>
              <input className="input" value={form.loaders} onChange={(e) => set('loaders', e.target.value)} />
            </label>
          </div>
          <div className="field">
            <span>详细介绍</span>
            <MarkdownEditor
              value={form.body}
              onChange={(v) => set('body', v)}
              rows={8}
              maxLength={5000}
              placeholder="原站介绍（可改），支持 Markdown。"
            />
          </div>
          {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
        </div>

        <div className="res-import-foot">
          <span className="small muted">收录后条目作者是你，来源会标在详情页</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => !busy && onClose()}>
            取消
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={busy}>
            {busy ? '收录中…' : '确认收录'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
