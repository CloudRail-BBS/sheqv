import type { ReactNode } from 'react';
import { MEDIA_W, mediaUrl } from './media';

/**
 * 极简 Markdown 渲染。
 *
 * 不引第三方解析器：只支持社区常用的标题 / 粗斜体 / 删除线 / 行内代码 /
 * 代码块 / 引用 / 有序无序列表 / 链接 / 图片。所有原始 HTML 都当文本处理，
 * 不存在 `dangerouslySetInnerHTML`，因此没有 XSS 面。
 */

function safeUrl(raw: string, image = false): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (image) {
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    if (url.startsWith('https://') || url.startsWith('http://')) return url;
    return null;
  }
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) return url;
  return null;
}

let seq = 0;
const nextKey = () => `md-${(seq += 1)}`;

function inline(text: string): ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g;
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];

    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={nextKey()}>{inline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith('~~')) {
      out.push(<del key={nextKey()}>{inline(token.slice(2, -2))}</del>);
    } else if (token.startsWith('`')) {
      out.push(<code key={nextKey()}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('![')) {
      const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      const src = m ? safeUrl(m[2], true) : null;
      if (m && src) {
        out.push(
          <span className="md-image" key={nextKey()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(src, MEDIA_W.hero)}
              alt={m[1] || '图片'}
              loading="lazy"
              decoding="async"
            />
          </span>,
        );
      } else {
        out.push(token);
      }
    } else if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = m ? safeUrl(m[2]) : null;
      if (m && href) {
        out.push(
          <a key={nextKey()} href={href} target="_blank" rel="noreferrer noopener">
            {inline(m[1])}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else if (token.startsWith('*') || token.startsWith('_')) {
      out.push(<em key={nextKey()}>{inline(token.slice(1, -1))}</em>);
    } else {
      out.push(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^```/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  );
}

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(
        <pre key={nextKey()} className="md-code">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2]);
      if (level === 1) out.push(<h1 key={nextKey()}>{content}</h1>);
      else if (level === 2) out.push(<h2 key={nextKey()}>{content}</h2>);
      else out.push(<h3 key={nextKey()}>{content}</h3>);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(
        <blockquote key={nextKey()}>{blocks(quote.join('\n'))}</blockquote>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={nextKey()}>
          {items.map((item) => (
            <li key={nextKey()}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      out.push(
        <ol key={nextKey()}>
          {items.map((item) => (
            <li key={nextKey()}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStart(lines[i]) &&
      !/^!\[[^\]]*\]\([^)]+\)\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={nextKey()}>
        {para.map((p, idx) => (
          <span key={`${p.slice(0, 8)}-${idx}`}>
            {inline(p)}
            {idx < para.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  }

  return out;
}

export function Markdown({ text, className = 'md-body' }: { text: string; className?: string }) {
  return <div className={className}>{blocks(text)}</div>;
}

/** 给摘要/搜索用：去掉常见 Markdown 标记 */
export function markdownToText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
