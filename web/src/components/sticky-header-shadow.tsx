'use client';

import { useEffect } from 'react';

/** Adds the site header's subtle scroll shadow without changing its sticky behavior. */
export function StickyHeaderShadow() {
  useEffect(() => {
    const site = document.querySelector<HTMLElement>('.site-scroll');
    const header = site?.querySelector<HTMLElement>('.topbar');
    if (!site || !header) return;

    const getRoot = () => {
      const overflowY = window.getComputedStyle(site).overflowY;
      return (overflowY === 'auto' || overflowY === 'scroll') && site.scrollHeight > site.clientHeight
        ? site
        : null;
    };
    let root = getRoot();
    let target: HTMLElement | Window = root ?? window;
    let frame = 0;

    const update = () => {
      frame = 0;
      const scrollOffset = root?.scrollTop ?? window.scrollY;
      const alpha = Math.min(1, Math.max(0, scrollOffset / 24)) * 0.16;
      header.style.setProperty('--topbar-scroll-alpha', alpha.toFixed(3));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const handleResize = () => {
      const nextRoot = getRoot();
      if (nextRoot !== root) {
        target.removeEventListener('scroll', scheduleUpdate);
        root = nextRoot;
        target = root ?? window;
        target.addEventListener('scroll', scheduleUpdate, { passive: true });
      }
      scheduleUpdate();
    };

    target.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    update();

    return () => {
      target.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', handleResize);
      if (frame) window.cancelAnimationFrame(frame);
      header.style.removeProperty('--topbar-scroll-alpha');
    };
  }, []);

  return null;
}
