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
    kicker: '从这里开始',
    title: '注册一个账号，就能发帖、评论与签署公约',
    desc: '第一个注册的账号自动成为管理员。本站没有内置账号，社区内容全部来自真实用户。',
    cta: '注册账号',
    href: '/register',
    tone: 'green',
  },
  {
    kicker: '社区规则',
    title: '发帖前先看一眼两份公约',
    desc: '《社区公约》管发言，《诚信公约》管比赛。公约升版后需要重新签署，旧签名自动失效。',
    cta: '阅读公约',
    href: '/agreements',
    tone: 'amber',
  },
  {
    kicker: '支持我们',
    title: '服务器与赛事奖品来自赞助',
    desc: '赞助名单公开可查，金额与时间直接读爱发电的接口，不投放广告也不卖榜单位置。',
    cta: '查看赞助者',
    href: '/sponsors',
    tone: 'blue',
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
