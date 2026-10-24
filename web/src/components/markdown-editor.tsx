'use client';

import { useRef, useState } from 'react';
import { Markdown } from '@/lib/markdown';

/**
 * Discourse 风格的 Markdown 编辑器：
 * 工具栏 + 写/预览切换 + 拖拽/粘贴/选择图片上传 + Ctrl+B/I/K 快捷键。
 *
 * 正文仍是纯文本 Markdown，落库格式不变；渲染由 `lib/markdown.tsx` 负责。
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = '正文…',
  rows = 8,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
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

  return (
    <div className="md-editor">
      <div className="md-toolbar">
        <div className="md-tools">
          <button type="button" title="粗体 Ctrl+B" onClick={() => replaceSelection('**', '**', '粗体')}>
            <b>B</b>
          </button>
          <button type="button" title="斜体 Ctrl+I" onClick={() => replaceSelection('*', '*', '斜体')}>
            <i>I</i>
          </button>
          <button type="button" title="删除线" onClick={() => replaceSelection('~~', '~~', '删除线')}>
            <s>S</s>
          </button>
          <span className="md-sep" />
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
        </div>

        <div className="md-tabs">
          <button type="button" data-on={tab === 'write'} onClick={() => setTab('write')}>
            写
          </button>
          <button type="button" data-on={tab === 'preview'} onClick={() => setTab('preview')}>
            预览
          </button>
        </div>
      </div>

      {tab === 'write' ? (
        <textarea
          ref={ref}
          className="md-input"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onDrop={onDrop}
          onKeyDown={onKeyDown}
          placeholder={`${placeholder}\n\n支持 Markdown：**粗体**、*斜体*、\`代码\`、> 引用、- 列表、[链接](https://…)\n可直接粘贴或拖入图片。`}
        />
      ) : (
        <div className="md-preview">
          {value.trim() ? <Markdown text={value} /> : <p className="muted">还没有内容。</p>}
        </div>
      )}

      <div className="md-foot">
        <span>{value.length} 字</span>
        <span>支持 Markdown · 可拖入图片 · Ctrl+B / I / K</span>
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
