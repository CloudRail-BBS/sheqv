import type { ReactNode } from 'react';
import { MEDIA_W, mediaUrl } from './media';
import { SmartImage } from '@/components/smart-image';

/** 图片尺寸表：正文里的图片只有 URL，尺寸由调用方批量查好传进来，用来锁死占位框 */
export type ImageSizes = Record<string, { w: number; h: number }>;

function mediaIdOf(src: string): string | null {
  const m = /^\/api\/v1\/media\/([A-Za-z0-9]+)/.exec(src);
  return m ? m[1] : null;
}

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

function inline(text: string, sizes?: ImageSizes): ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>"'）】]+)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];

    if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={nextKey()}>{inline(token.slice(2, -2), sizes)}</strong>);
    } else if (token.startsWith('~~')) {
      out.push(<del key={nextKey()}>{inline(token.slice(2, -2), sizes)}</del>);
    } else if (token.startsWith('`')) {
      out.push(<code key={nextKey()}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('![')) {
      const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      const src = m ? safeUrl(m[2], true) : null;
      if (m && src) {
        const dim = (() => {
          const id = mediaIdOf(src);
          return id ? sizes?.[id] : undefined;
        })();
        out.push(
          <span className="md-image" key={nextKey()}>
            {/* 渐进加载：模糊小图占位 → 500ms 变清晰；盒子按真实宽高锁死，不跳版 */}
            <SmartImage
              src={mediaUrl(src, MEDIA_W.hero) ?? src}
              alt={m[1] || '图片'}
              width={dim?.w}
              height={dim?.h}
              sizes="(max-width: 700px) 100vw, 720px"
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
    } else if (token.startsWith('http')) {
      // 裸链接也点得动；句末标点属于正文，不吞进 href
      const trimmed = token.replace(/[.,;:!?，。；：！？、]+$/, '');
      const href = safeUrl(trimmed);
      if (href) {
        out.push(
          <a key={nextKey()} href={href} target="_blank" rel="noreferrer noopener">
            {trimmed}
          </a>,
        );
        if (trimmed.length < token.length) out.push(token.slice(trimmed.length));
      } else {
        out.push(token);
      }
    } else if (token.startsWith('*') || token.startsWith('_')) {
      out.push(<em key={nextKey()}>{inline(token.slice(1, -1), sizes)}</em>);
    } else {
      out.push(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * 哔哩哔哩视频链接识别。
 *
 * 支持 `bilibili.com/video/BV…`、`av…`（含 `?p=` 分 P），也接受 `m.` 移动站域名。
 * 只认「整行就是一个视频链接」的情况（裸链接或 `[标题](链接)`）——
 * 混在句子中间的仍然按普通链接处理，不然正文会被一个播放器从中间劈开。
 */
export interface BiliVideo {
  /** BV 号或 av 号（原样保留前缀） */
  id: string;
  page: number;
  /** 规整后的站内地址，用来做「在 B 站观看」 */
  href: string;
}

export function biliVideoOf(raw: string): BiliVideo | null {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
  const m = /^\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i.exec(url.pathname);
  if (!m) return null;
  const id = m[1];
  const rawPage = Number(url.searchParams.get('p') ?? '1');
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  return {
    id,
    page,
    href: `https://www.bilibili.com/video/${id}${page > 1 ? `?p=${page}` : ''}`,
  };
}

function BiliEmbed({ video }: { video: BiliVideo }) {
  const id = video.id.toLowerCase().startsWith('av')
    ? `aid=${video.id.slice(2)}`
    : `bvid=${video.id}`;
  return (
    <figure className="md-video">
      <div className="md-video-frame">
        <iframe
          src={`https://player.bilibili.com/player.html?${id}&p=${video.page}&autoplay=0&danmaku=0&high_quality=1`}
          title="哔哩哔哩视频"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen; picture-in-picture"
        />
      </div>
      <figcaption>
        <a href={video.href} target="_blank" rel="noreferrer noopener">
          在哔哩哔哩观看
        </a>
      </figcaption>
    </figure>
  );
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

function blocks(text: string, sizes?: ImageSizes): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  // 同名标题的锚点后缀计数，保证 id 唯一
  const anchorSeen = new Map<string, number>();
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
      const content = inline(heading[2], sizes);
      // 给标题一个稳定 id，右侧「本页目录」才能跳转；同名标题加序号去重
      const base = headingAnchor(heading[2]);
      const seen = anchorSeen.get(base) ?? 0;
      anchorSeen.set(base, seen + 1);
      const id = seen === 0 ? base : `${base}-${seen + 1}`;
      if (level === 1) out.push(<h1 key={nextKey()} id={id}>{content}</h1>);
      else if (level === 2) out.push(<h2 key={nextKey()} id={id}>{content}</h2>);
      else out.push(<h3 key={nextKey()} id={id}>{content}</h3>);
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
        <blockquote key={nextKey()}>{blocks(quote.join('\n'), sizes)}</blockquote>,
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
            <li key={nextKey()}>{inline(item, sizes)}</li>
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
            <li key={nextKey()}>{inline(item, sizes)}</li>
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
    // 整段就是一个 B 站链接 → 换成播放器（裸链接或 [标题](链接) 都算）
    const only = para.length === 1 ? para[0].trim() : '';
    if (only) {
      const linked = /^\[[^\]]*\]\(([^)]+)\)$/.exec(only);
      const video = biliVideoOf(linked ? linked[1] : only);
      if (video) {
        out.push(<BiliEmbed key={nextKey()} video={video} />);
        continue;
      }
    }

    out.push(
      <p key={nextKey()}>
        {para.map((p, idx) => (
          <span key={`${p.slice(0, 8)}-${idx}`}>
            {inline(p, sizes)}
            {idx < para.length - 1 && <br />}
          </span>
        ))}
      </p>,
    );
  }

  return out;
}

export function Markdown({
  text,
  className = 'md-body',
  imageSizes,
}: {
  text: string;
  className?: string;
  /** 站内图片的宽高表（见 `lib/media-sizes.ts`），用来提前锁定图片框 */
  imageSizes?: ImageSizes;
}) {
  return <div className={className}>{blocks(text, imageSizes)}</div>;
}

/** 给摘要/搜索用：去掉常见 Markdown 标记 */
/** 标题 → 锚点：保留中英文与数字，其余压成连字符 */
export function headingAnchor(raw: string): string {
  const cleaned = raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[`*_~#]/g, '')
    .trim()
    .toLowerCase();
  const slug = cleaned
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'section';
}

export function markdownToText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
