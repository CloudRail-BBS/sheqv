'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Slide {
  kicker: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  tone: 'green' | 'blue' | 'amber';
}

const SLIDES: Slide[] = [
  {
    kicker: 'S3 赛季',
    title: '公会战开赛：名单锁定后不可变更',
    desc: '双方独立提交结果，一致自动确认，不一致进入争议。只有确认的战绩计入榜单。',
    cta: '查看赛程',
    href: '/matches',
    tone: 'green',
  },
  {
    kicker: '资源上新',
    title: '天空之城 v2.1 · 新增两座浮空岛',
    desc: '遗迹战利品表重做，空艇区块加载问题已修复，老存档建议重新生成世界。',
    cta: '查看资源',
    href: '/resources/sky-citadel',
    tone: 'blue',
  },
  {
    kicker: '规则更新',
    title: '确认窗口 24 小时，逾期自动确认',
    desc: '举证期 72 小时；名单外人员参赛判定违约，记一次信誉事件。',
    cta: '阅读规则',
    href: '/matches/m-2041',
    tone: 'amber',
  },
];

export function Carousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const count = SLIDES.length;

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % count), 5600);
    return () => clearInterval(t);
  }, [paused, count]);

  const go = (n: number) => setI((n + count) % count);

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
        {SLIDES.map((s) => (
          <article key={s.title} className={'slide tone-' + s.tone} aria-hidden={SLIDES[i] !== s}>
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
        {SLIDES.map((s, n) => (
          <button
            key={s.title}
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
