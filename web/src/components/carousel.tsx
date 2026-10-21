'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import type { Slide } from '@/lib/slide-store';

export function Carousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const count = slides.length;

  useEffect(() => {
    if (paused || count <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % count), 5600);
    return () => clearInterval(t);
  }, [paused, count]);

  const go = (n: number) => setI((n + count) % count);

  // 后台把轮播全删了就不占位，首页直接跳过这一块
  if (count === 0) return null;

  return (
    <section
      className="carousel"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        startX.current = e.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const sx = startX.current;
        if (sx !== null) {
          const dx = e.changedTouches[0].clientX - sx;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        }
        startX.current = null;
        setPaused(false);
      }}
    >
      <div className="slides" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s) => (
          <article
            key={s.id}
            className="slide"
            aria-hidden={slides[i] !== s}
            data-tone={s.textTone}
            data-has-image={Boolean(s.bgImage)}
            style={{
              background: s.bgImage ? `url("${s.bgImage}") center / cover no-repeat` : s.bgColor,
            }}
          >
            <span className="kicker">{s.kicker}</span>
            <h2>{s.title}</h2>
            <p>{s.desc}</p>
            <Link href={s.href} className="slide-cta">
              {s.cta}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </article>
        ))}
      </div>

      <button className="cnav prev" aria-label="上一张" onClick={() => go(i - 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="cnav next" aria-label="下一张" onClick={() => go(i + 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="dots">
        {slides.map((s, n) => (
          <button
            key={s.id}
            className="cd"
            data-on={n === i}
            aria-label={`第 ${n + 1} 张`}
            onClick={() => go(n)}
          />
        ))}
      </div>
    </section>
  );
}
