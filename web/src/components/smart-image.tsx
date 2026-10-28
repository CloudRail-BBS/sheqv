'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 渐进式图片。
 *
 * - **占位**：先用 `?w=32` 的小图铺满，配合 `blur(20px)` 做同色调底；
 * - **过渡**：原图加载完成后 500ms 内从模糊变清晰，同时从 1.04 缩回 1；
 * - **不跳版**：外层盒子按 `width/height`（或 `ratio`）提前锁定比例；
 * - **懒加载**：进入视口前 300px 才开始请求，避免首屏被一堆图占满连接。
 *
 * 站内图片走 `/api/v1/media/{id}`，能拿到 32px 版本；外部图床没有小图，
 * 只锁比例、不做模糊过渡（直接淡入）。
 */
export function SmartImage({
  src,
  alt,
  width,
  height,
  ratio,
  className,
  priority = false,
  sizes = '(max-width: 700px) 100vw, 720px',
}: {
  src: string;
  alt?: string;
  /** 原图宽高：用来锁定占位框，避免加载后跳动 */
  width?: number;
  height?: number;
  /** 拿不到宽高时的兜底比例，默认 16 / 10 */
  ratio?: string;
  className?: string;
  /** 首屏主图：不做懒加载 */
  priority?: boolean;
  sizes?: string;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(priority);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    if (visible) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      // 提前 300px 开始加载：滚动到位时图已经快好了
      { rootMargin: '300px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const lqip = thumbUrl(src, 32);
  const boxStyle = ratio
    ? { aspectRatio: ratio }
    : width && height
      ? { aspectRatio: `${width} / ${height}` }
      : { aspectRatio: '16 / 10' };

  return (
    <span
      ref={boxRef}
      className={`simg${className ? ` ${className}` : ''}`}
      style={boxStyle}
      data-ready={loaded}
    >
      {lqip && <img className="simg-lqip" src={lqip} alt="" aria-hidden="true" decoding="async" />}
      {/* 没有 JS 时 IntersectionObserver 不会跑，至少把原图漏出来 */}
      <noscript>
        <img className="simg-full simg-noscript" src={src} alt={alt ?? ''} />
      </noscript>
      {visible && (
        <img
          className="simg-full"
          src={src}
          alt={alt ?? ''}
          width={width}
          height={height}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          data-loaded={loaded}
        />
      )}
    </span>
  );
}

/** 站内图片加宽度参数；外部地址原样返回（拿不到小图） */
function thumbUrl(src: string, width: number): string | null {
  if (!src.startsWith('/api/v1/media/')) return null;
  const base = src.split('?')[0];
  return `${base}?w=${width}`;
}
