'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Markdown } from '@/lib/markdown';

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
  const [uploading, setUploading] = useState(false);
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

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      setErr('只能上传图片');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr('图片不能超过 2MB');
      return;
    }
    setUploading(true);
    setErr(null);
    const res = await fetch('/api/v1/me/media?kind=post', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
    }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setErr(data?.message ?? '上传失败');
      return;
    }
    const data = (await res.json()) as { url: string };
    const alt = file.name.replace(/\.[^.]+$/, '').slice(0, 30) || '图片';
    replaceSelection(`\n![${alt}](${data.url})\n`);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void upload(file);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void upload(file);
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
      <button type="button" title="上传图片" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上传中…' : '图片'}
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
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
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
