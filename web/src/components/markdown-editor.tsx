'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Markdown } from '@/lib/markdown';
import { compressImage, formatBytes, imageTypeError, uploadWithProgress } from '@/lib/upload';

const EMOJIS = ['👍', '🎉', '🔥', '😂', '❤️', '✅', '⚔️', '🧱', '🚀', '👀', '🤝', '💡'];

/**
 * Markdown 编辑器。
 *
 * default：管理后台用，工具栏在顶部 + 写/预览切换 + 字数。
 * composer：发帖弹窗用，无边框正文 + 底部工具栏，可传入头像与发布按钮。
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = '正文…',
  rows = 8,
  onSubmit,
  variant = 'default',
  leading,
  actions,
  beforeFooter,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  onSubmit?: () => void;
  variant?: 'default' | 'composer';
  /** 底部工具栏左侧（发帖时放头像/ME） */
  leading?: ReactNode;
  /** 底部工具栏右侧（发帖时放取消/发布） */
  actions?: ReactNode;
  /** 正文与底部工具栏之间（发布资源时放文件区） */
  beforeFooter?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  /** 正在上传的图片进度：第几张 / 共几张 / 当前百分比 */
  const [uploading, setUploading] = useState<{ done: number; total: number; pct: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function replaceSelection(before: string, after = '', placeholderText = '') {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLine(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  const MAX_IMAGE = 2 * 1024 * 1024;

  /** 一次可以传多张：串行上传，逐张插入，避免并发把顺序打乱 */
  async function uploadAll(list: File[]) {
    const files = list.filter((f) => f.type.startsWith('image/') || !f.type);
    if (files.length === 0) {
      setErr('只能上传图片');
      return;
    }

    setErr(null);
    const snippets: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const typeErr = imageTypeError(file);
      if (typeErr) {
        setErr(`${file.name}：${typeErr}`);
        break;
      }

      setUploading({ done: i, total: files.length, pct: 0 });
      const { file: prepared } = await compressImage(file, {
        maxEdge: 1600,
        maxBytes: MAX_IMAGE * 0.8,
      });
      if (prepared.size > MAX_IMAGE) {
        setErr(
          file.type === 'image/gif'
            ? `${file.name}：GIF 动图不能压缩，请控制在 2MB 以内`
            : `${file.name} 压缩后仍有 ${formatBytes(prepared.size)}，换一张小点的吧`,
        );
        break;
      }

      const res = await uploadWithProgress('/api/v1/me/media?kind=post', prepared, {
        headers: { 'content-type': prepared.type || 'application/octet-stream' },
        onProgress: (pct) => setUploading({ done: i, total: files.length, pct }),
        timeoutMs: 60_000,
      });
      if (!res.ok) {
        setErr(res.message ?? `${file.name} 上传失败`);
        break;
      }
      const url = (res.data as { url?: string } | null)?.url;
      if (!url) {
        setErr('上传成功但没拿到图片地址');
        break;
      }
      const alt = file.name.replace(/\.[^.]+$/, '').slice(0, 30) || '图片';
      snippets.push(`![${alt}](${url})`);
      setUploading({ done: i + 1, total: files.length, pct: 100 });
    }

    setUploading(null);
    if (snippets.length > 0) {
      // 一次插入，避免多张时闭包里的 value 互相覆盖
      insertBlock(snippets.map((x) => `\n${x}\n`).join(''));
    }
  }

  /** 在上传结束时插入正文；用 DOM 里的当前值，上传期间打的字不会被冲掉 */
  function insertBlock(text: string) {
    const el = ref.current;
    const base = el ? el.value : value;
    const start = el?.selectionStart ?? base.length;
    const end = el?.selectionEnd ?? base.length;
    onChange(base.slice(0, start) + text + base.slice(end));
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void uploadAll(files);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void uploadAll(files);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      replaceSelection('**', '**', '粗体');
    } else if (e.key.toLowerCase() === 'i') {
      e.preventDefault();
      replaceSelection('*', '*', '斜体');
    } else if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      replaceSelection('[', '](https://)', '链接文字');
    } else if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  const tools = (
    <>
      <button type="button" title="粗体 Ctrl+B" onClick={() => replaceSelection('**', '**', '粗体')}>
        <b>B</b>
      </button>
      <button type="button" title="斜体 Ctrl+I" onClick={() => replaceSelection('*', '*', '斜体')}>
        <i>I</i>
      </button>
      <button type="button" title="删除线" onClick={() => replaceSelection('~~', '~~', '删除线')}>
        <s>S</s>
      </button>
      <button type="button" title="标题" onClick={() => prefixLine('## ')}>
        H
      </button>
      <button type="button" title="引用" onClick={() => prefixLine('> ')}>
        ❝
      </button>
      <button type="button" title="行内代码" onClick={() => replaceSelection('`', '`', 'code')}>
        {'</>'}
      </button>
      <button type="button" title="代码块" onClick={() => replaceSelection('\n```\n', '\n```\n', '代码')}>
        ⌗
      </button>
      <button type="button" title="链接 Ctrl+K" onClick={() => replaceSelection('[', '](https://)', '链接文字')}>
        ↗
      </button>
      <button type="button" title="无序列表" onClick={() => prefixLine('- ')}>
        •≡
      </button>
      <button type="button" title="有序列表" onClick={() => prefixLine('1. ')}>
        1≡
      </button>
      <span className="md-sep" />
      <button type="button" title="上传图片（可多选，支持粘贴与拖入）" onClick={() => fileRef.current?.click()} disabled={Boolean(uploading)}>
        {uploading
          ? `${uploading.total > 1 ? `${uploading.done + 1}/${uploading.total} ` : ''}${
              uploading.pct > 0 ? `${uploading.pct}%` : '压缩中…'
            }`
          : '图片'}
      </button>
      <div className="md-emoji-wrap">
        <button type="button" title="表情" onClick={() => setEmojiOpen((v) => !v)}>
          ☺
        </button>
        {emojiOpen && (
          <div className="md-emoji-pop">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  replaceSelection(e);
                  setEmojiOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        multiple
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = '';
          if (list.length > 0) void uploadAll(list);
        }}
      />
    </>
  );

  const tabs = (
    <div className="md-tabs">
      <button type="button" data-on={tab === 'write'} onClick={() => setTab('write')}>
        写
      </button>
      <button type="button" data-on={tab === 'preview'} onClick={() => setTab('preview')}>
        预览
      </button>
    </div>
  );

  const editor = tab === 'write' ? (
    <textarea
      ref={ref}
      className="md-input"
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      onPaste={onPaste}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
    />
  ) : (
    <div className="md-preview">
      {value.trim() ? <Markdown text={value} /> : <p className="muted">还没有内容。</p>}
    </div>
  );

  if (variant === 'composer') {
    return (
      <div className="md-editor md-composer-editor">
        {editor}
        {beforeFooter}
        <div className="md-toolbar md-toolbar-bottom">
          {leading && <div className="md-leading">{leading}</div>}
          <div className="md-tools">{tools}</div>
          <div className="md-toolbar-right">
            {tabs}
            {actions}
          </div>
        </div>
        {err && <div className="md-inline-err">{err}</div>}
      </div>
    );
  }

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        <div className="md-tools">{tools}</div>
        {tabs}
      </div>
      {editor}
      <div className="md-foot">
        <span>{value.length} 字</span>
        <span>支持 Markdown · 可拖入图片 · Ctrl+B / I / K</span>
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
