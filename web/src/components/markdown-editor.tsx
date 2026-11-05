'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Markdown } from '@/lib/markdown';
import { compressImage, formatBytes, imageTypeError, uploadWithProgress } from '@/lib/upload';

const EMOJIS = ['👍', '🎉', '🔥', '😂', '❤️', '✅', '⚔️', '🧱', '🚀', '👀', '🤝', '💡'];

/**
 * 工具栏图标：16px、1.7 描边、统一网格。
 * 之前用 ⌗ / •≡ / 1≡ / ❝ 这些字符凑，字号与视觉重量各不相同，一排看过去是歪的；
 * 换成同一套描边图标后，按钮之间的节奏才一致。
 */
const ICONS = {
  bold: <path d="M7 5h5.2a3.4 3.4 0 0 1 0 6.8H7zM7 11.8h5.8a3.6 3.6 0 0 1 0 7.2H7z" />,
  italic: <path d="M15 5h-4M13 19H9M14.5 5 9.5 19" />,
  strike: <path d="M6 12h12M8.2 8.4A3.4 3.4 0 0 1 11.6 5c1.9 0 3.4.9 3.9 2.3M15.8 15.2A3.5 3.5 0 0 1 12.2 19c-1.9 0-3.5-1-4-2.4" />,
  heading: <path d="M6 5v14M18 5v14M6 12h12" />,
  quote: <path d="M5 5v14M10 8h9M10 12h7M10 16h5" />,
  code: <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />,
  block: <path d="M4 6h16v12H4zM9.5 10 8 12l1.5 2M14.5 10 16 12l-1.5 2" />,
  link: <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1" />,
  bullet: <path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01" />,
  ordered: (
    <>
      <path d="M10 7h9M10 12h9M10 17h9" />
      <path d="M4 6.2 5.2 5.5V9M4 14.4c0-.8.7-1.4 1.4-1.4s1.3.6 1.3 1.3c0 1.2-2.7 1.7-2.7 3.2h2.8" />
    </>
  ),
  image: <path d="M4 5h16v14H4zM4 15.5 9 11l4.5 4.5M14 13l2-2 4 3.5M9.2 9.2h.01" />,
  emoji: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M8.5 14.5c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8" />,
} as const;

function MdIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/**
 * Markdown 编辑器。
 *
 * default：管理后台用，工具栏在顶部 + 写/预览切换 + 字数。
 * composer：发帖弹窗用，无边框正文 + 底部工具栏，可传入头像与发布按钮。
 *
 * 预览在桌面端是**右侧分栏**（左写右看，边打字边看效果），
 * 手机上仍是原来的整页切换——小屏并排两栏谁都看不清。
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
      {/* 排版工具：手机上这一排横向滚动，图片/表情固定在右端不跟着滚 */}
      <div className="md-tools-scroll">
      <div className="md-group">
        <button type="button" aria-label="粗体" title="粗体 · Ctrl+B" onClick={() => replaceSelection('**', '**', '粗体')}>
          <MdIcon name="bold" />
        </button>
        <button type="button" aria-label="斜体" title="斜体 · Ctrl+I" onClick={() => replaceSelection('*', '*', '斜体')}>
          <MdIcon name="italic" />
        </button>
        <button type="button" aria-label="删除线" title="删除线" onClick={() => replaceSelection('~~', '~~', '删除线')}>
          <MdIcon name="strike" />
        </button>
      </div>
      <span className="md-sep" aria-hidden="true" />
      <div className="md-group">
        <button type="button" aria-label="标题" title="标题" onClick={() => prefixLine('## ')}>
          <MdIcon name="heading" />
        </button>
        <button type="button" aria-label="引用" title="引用" onClick={() => prefixLine('> ')}>
          <MdIcon name="quote" />
        </button>
        <button type="button" aria-label="行内代码" title="行内代码" onClick={() => replaceSelection('`', '`', 'code')}>
          <MdIcon name="code" />
        </button>
        <button type="button" aria-label="代码块" title="代码块" onClick={() => replaceSelection('\n```\n', '\n```\n', '代码')}>
          <MdIcon name="block" />
        </button>
      </div>
      <span className="md-sep" aria-hidden="true" />
      <div className="md-group">
        <button type="button" aria-label="插入链接" title="插入链接 · Ctrl+K" onClick={() => replaceSelection('[', '](https://)', '链接文字')}>
          <MdIcon name="link" />
        </button>
        <button type="button" aria-label="无序列表" title="无序列表" onClick={() => prefixLine('- ')}>
          <MdIcon name="bullet" />
        </button>
        <button type="button" aria-label="有序列表" title="有序列表" onClick={() => prefixLine('1. ')}>
          <MdIcon name="ordered" />
        </button>
      </div>
      </div>
      <div className="md-group md-group-end">
        <button
          type="button"
          aria-label="上传图片"
          title="上传图片（可多选，支持粘贴与拖入）"
          className={uploading ? 'md-uploading' : undefined}
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(uploading)}
        >
          {uploading ? (
            <span className="md-upload">
              {uploading.total > 1 ? `${uploading.done + 1}/${uploading.total} ` : ''}
              {uploading.pct > 0 ? `${uploading.pct}%` : '压缩中'}
            </span>
          ) : (
            <MdIcon name="image" />
          )}
        </button>
        <div className="md-emoji-wrap">
          <button type="button" aria-label="表情" title="表情" onClick={() => setEmojiOpen((v) => !v)}>
            <MdIcon name="emoji" />
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
    <div className="md-tabs" role="tablist" aria-label="编辑与预览">
      {(['write', 'preview'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          data-on={tab === k}
          onClick={() => setTab(k)}
        >
          {k === 'write' ? '写' : '预览'}
        </button>
      ))}
    </div>
  );

  const panes = (
    <div className="md-panes" data-mode={tab}>
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
      {tab === 'preview' && (
        <div className="md-preview">
          <div className="md-preview-inner">
            {value.trim() ? <Markdown text={value} /> : <p className="muted">还没有内容。</p>}
          </div>
        </div>
      )}
    </div>
  );

  if (variant === 'composer') {
    return (
      <div className="md-editor md-composer-editor">
        {panes}
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
      {panes}
      <div className="md-foot">
        <span>{value.length} 字</span>
        <span>支持 Markdown · 可拖入图片 · Ctrl+B / I / K</span>
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
