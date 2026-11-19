'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { parallaxCompensation } from '@/lib/scroll-motion.mjs';

import type { Slide } from '@/lib/slide-store';

export function Carousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const startX = useRef<number | null>(null);
  const carouselRef = useRef<HTMLElement | null>(null);
  const count = slides.length;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (paused || interactionPaused || focused || prefersReducedMotion || count <= 1) return;
    const t = setInterval(() => setI((v) => (v + 1) % count), 5600);
    return () => clearInterval(t);
  }, [paused, interactionPaused, focused, prefersReducedMotion, count]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || prefersReducedMotion) return;

    const site = document.querySelector<HTMLElement>('.site-scroll');
    const getScrollableRoot = () => {
      const overflowY = site ? window.getComputedStyle(site).overflowY : 'visible';
      return site && (overflowY === 'auto' || overflowY === 'scroll') && site.scrollHeight > site.clientHeight
        ? site
        : null;
    };
    let scrollRoot = getScrollableRoot();
    let scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    let initialTop = 0;
    let frame = 0;

    const rootTop = () => scrollRoot?.getBoundingClientRect().top ?? 0;
    const update = () => {
      frame = 0;
      const top = carousel.getBoundingClientRect().top - rootTop();
      const scrollOffset = Math.max(0, initialTop - top);
      carousel.querySelectorAll<HTMLElement>('[data-depth]').forEach((layer) => {
        const depth = Number(layer.dataset.depth);
        layer.style.transform = `translate3d(0, ${parallaxCompensation(scrollOffset, depth)}px, 0)`;
      });
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const handleResize = () => {
      const nextRoot = getScrollableRoot();
      if (nextRoot !== scrollRoot) {
        scrollTarget.removeEventListener('scroll', scheduleUpdate);
        scrollRoot = nextRoot;
        scrollTarget = scrollRoot ?? window;
        scrollTarget.addEventListener('scroll', scheduleUpdate, { passive: true });
        initialTop = carousel.getBoundingClientRect().top - rootTop() + (scrollRoot?.scrollTop ?? window.scrollY);
      }
      scheduleUpdate();
    };

    scrollTarget.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    initialTop = carousel.getBoundingClientRect().top - rootTop() + (scrollRoot?.scrollTop ?? window.scrollY);
    update();

    return () => {
      scrollTarget.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', handleResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [prefersReducedMotion]);

  const go = (n: number) => setI((n + count) % count);

  // 后台把轮播全删了就不占位，首页直接跳过这一块
  if (count === 0) return null;

  return (
    <section
      ref={carouselRef}
      className="carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="首页推荐"
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => {
        startX.current = e.touches[0].clientX;
        setInteractionPaused(true);
      }}
      onTouchEnd={(e) => {
        const sx = startX.current;
        if (sx !== null) {
          const dx = e.changedTouches[0].clientX - sx;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        }
        startX.current = null;
        setInteractionPaused(false);
      }}
    >
      <div className="slides" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s) => (
          <article
            key={s.id}
            className="slide"
            aria-hidden={slides[i] !== s}
            inert={slides[i] !== s}
            data-tone={s.textTone}
            data-has-image={Boolean(s.bgImage)}
            style={{
              backgroundColor: s.bgColor,
            }}
          >
            <div className="slide-parallax-stack" aria-hidden="true">
              <span
                className="slide-parallax-image"
                data-depth="0.4"
                style={s.bgImage ? { backgroundImage: `url("${s.bgImage}")` } : undefined}
              />
              <span className="slide-parallax-atmosphere" data-depth="0.15" />
              <span className="slide-parallax-rails" data-depth="0.7" />
            </div>
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
            aria-current={n === i ? 'true' : undefined}
            onClick={() => go(n)}
          />
        ))}
      </div>
      {count > 1 && !prefersReducedMotion && (
        <button
          type="button"
          className="carousel-pause"
          aria-label={paused ? '继续自动播放' : '暂停自动播放'}
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 6 10 6-10 6z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 6v12M16 6v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </section>
  );
}
