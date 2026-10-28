'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { RESOURCE_CATEGORIES, RESOURCE_GAMES, RESOURCE_LICENSES, fmtSize } from '@/lib/resource-types';
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
  gameVersions: '',
  loaders: '',
  deps: '',
  sourceUrl: '',
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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');
  /** 已上传的附件（fileId + 名称 + 大小），提交时只传 id，服务端按上传记录取名字 */
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number }[]>([]);

  useEffect(() => setMounted(true), []);

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

  /** 一次上传一个（串行），进度按「第几个 / 共几个」显示，避免多路进度互相覆盖 */
  function uploadOne(file: File, index: number, total: number): Promise<{ id: string; name: string; size: number } | null> {
    return new Promise((resolve) => {
      if (file.size > 100 * 1024 * 1024) {
        setErr(`${file.name} 超过 100MB`);
        resolve(null);
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/v1/me/resource-file?name=${encodeURIComponent(file.name)}`, true);
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const one = e.loaded / e.total;
        const overall = (index + one) / total;
        setUploadPct(Math.round(overall * 100));
      };
      xhr.onload = () => {
        type UploadRes = { id?: string; name?: string; size?: number; message?: string };
        let data: UploadRes | null = null;
        try {
          data = JSON.parse(xhr.responseText) as UploadRes;
        } catch {
          data = null;
        }
        if (xhr.status < 200 || xhr.status >= 300 || !data?.id) {
          setErr(data?.message ?? `${file.name} 上传失败`);
          resolve(null);
          return;
        }
        resolve({ id: data.id, name: data.name || file.name, size: data.size ?? file.size });
      };
      xhr.onerror = () => {
        setErr(`${file.name} 上传失败，请检查网络`);
        resolve(null);
      };
      xhr.send(file);
    });
  }

  async function uploadFiles(list: FileList) {
    if (uploading) return;
    const files = Array.from(list).slice(0, 8 - attachments.length);
    if (files.length === 0) {
      setErr('最多 8 个文件');
      return;
    }
    setErr(null);
    setUploading(true);
    setUploadPct(0);

    const added: { id: string; name: string; size: number }[] = [];
    for (let i = 0; i < files.length; i += 1) {
      setUploadLabel(`${i + 1} / ${files.length}`);
      const got = await uploadOne(files[i], i, files.length);
      if (got) added.push(got);
    }

    setUploading(false);
    setUploadLabel('');
    if (added.length > 0) {
      const next = [...attachments, ...added].slice(0, 8);
      setAttachments(next);
      const bytes = next.reduce((n, a) => n + a.size, 0);
      set('sizeMb', (bytes / 1024 / 1024).toFixed(2));
    }
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
    if (uploading) {
      setErr('文件还在上传，请稍候');
      return;
    }
    setErr(null);
    const title = form.title.trim();
    const url = form.url.trim();
    if (title.length < 2 || title.length > 60) {
      setErr('标题需为 2–60 字');
      return;
    }
    if (!url && attachments.length === 0) {
      setErr('请至少上传一个文件，或填写外部下载地址');
      return;
    }
    if (url && !/^https?:\/\/\S+$/i.test(url) && !url.startsWith('/api/v1/resource-files/')) {
      setErr('外部地址需要以 http/https 开头');
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
    // 有附件就以附件总大小为准，避免用户手填的和实际不一致
    const attachedBytes = attachments.reduce((n, a) => n + a.size, 0);
    const sizeMb = attachedBytes > 0 ? attachedBytes / 1024 / 1024 : Number(form.sizeMb);
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
        gameVersions: form.gameVersions.trim(),
        loaders: form.loaders.trim(),
        deps: form.deps.trim(),
        sourceUrl: form.sourceUrl.trim(),
        fileIds: attachments.map((a) => a.id),
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

      {mounted && open && createPortal(
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
                <label className="field">
                  <span>支持版本</span>
                  <input
                    className="input"
                    value={form.gameVersions}
                    onChange={(e) => set('gameVersions', e.target.value)}
                    placeholder="1.20.1, 1.20.4（逗号分隔）"
                    maxLength={120}
                  />
                </label>
                <label className="field">
                  <span>加载器 / 环境</span>
                  <input
                    className="input"
                    value={form.loaders}
                    onChange={(e) => set('loaders', e.target.value)}
                    placeholder="Forge, Fabric"
                    maxLength={60}
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>前置依赖（可空）</span>
                  <input
                    className="input"
                    value={form.deps}
                    onChange={(e) => set('deps', e.target.value)}
                    placeholder="需要 Fabric API 0.15+；与服务端插件冲突"
                    maxLength={300}
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>来源 / 原帖（可空）</span>
                  <input
                    className="input"
                    value={form.sourceUrl}
                    onChange={(e) => set('sourceUrl', e.target.value)}
                    placeholder="https://…"
                    maxLength={300}
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
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <span>文件（最多 8 个）</span>
                <div className="res-file-box">
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    multiple
                    onChange={(e) => {
                      const list = e.target.files;
                      e.target.value = '';
                      if (list && list.length > 0) void uploadFiles(list);
                    }}
                  />
                  <div className="res-file-tools">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading || busy || attachments.length >= 8}
                    >
                      {uploading ? `上传中 ${uploadPct}%` : '添加本地文件'}
                    </button>
                    <span className="small muted">
                      {uploading && uploadLabel
                        ? `正在上传 ${uploadLabel}`
                        : '单个 ≤100MB，可一次选多个'}
                    </span>
                    {attachments.length > 0 && (
                      <span className="small" style={{ marginLeft: 'auto', color: 'var(--blue)' }}>
                        共 {attachments.length} 个
                      </span>
                    )}
                  </div>

                  {attachments.length > 0 && (
                    <ul className="res-file-list">
                      {attachments.map((a) => (
                        <li key={a.id} className="res-file-row">
                          <span className="res-file-name" title={a.name}>{a.name}</span>
                          <span className="res-file-size mono">{fmtSize(a.size)}</span>
                          <button
                            type="button"
                            className="res-file-del"
                            aria-label={`移除 ${a.name}`}
                            onClick={() => {
                              const next = attachments.filter((x) => x.id !== a.id);
                              setAttachments(next);
                              const bytes = next.reduce((n, x) => n + x.size, 0);
                              set('sizeMb', bytes > 0 ? (bytes / 1024 / 1024).toFixed(2) : '');
                            }}
                          >
                            移除
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="field" style={{ marginTop: 2 }}>
                    <span>外部下载地址（可空）</span>
                    <input
                      className="input mono"
                      value={form.url}
                      onChange={(e) => set('url', e.target.value)}
                      placeholder="https://…/resource.zip；只上传文件时留空"
                    />
                  </label>
                </div>
                {uploading && (
                  <span className="res-upload-bar" aria-hidden="true">
                    <i style={{ width: `${uploadPct}%` }} />
                  </span>
                )}
              </div>
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
                  <button
                    type="button"
                    className="composer-submit"
                    onClick={submit}
                    disabled={busy || uploading}
                  >
                    {busy ? '发布中…' : '发布资源'}
                  </button>
                </>
              }
            />
          </div>
        </div>
      , document.body)}
    </>
  );
}
