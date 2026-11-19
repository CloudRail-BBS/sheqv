'use client';

import { useEffect, useRef, useState } from 'react';
import { revealTriggerLinePx } from '@/lib/scroll-motion.mjs';

function getScrollableSiteRoot(): HTMLElement | null {
  const site = document.querySelector<HTMLElement>('.site-scroll');
  if (!site) return null;
  const overflowY = window.getComputedStyle(site).overflowY;
  return (overflowY === 'auto' || overflowY === 'scroll') && site.scrollHeight > site.clientHeight
    ? site
    : null;
}

export function ScrollReveal({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const visibleRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(true);

  const updateVisible = (next: boolean) => {
    if (visibleRef.current === next) return;
    visibleRef.current = next;
    setVisible(next);
  };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scrollRoot = getScrollableSiteRoot();
    let scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    const rootBounds = () => scrollRoot?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
      height: window.innerHeight,
    };
    const currentTop = () => node.getBoundingClientRect().top - rootBounds().top;
    updateVisible(reduceMotion.matches || currentTop() <= revealTriggerLinePx(rootBounds().height));
    setReady(true);
    let armFrame = window.requestAnimationFrame(() => setArmed(true));

    const onIntersect: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.target === node && entry.isIntersecting) handleScroll();
      }
    };
    let observer: IntersectionObserver | undefined;
    let frame = 0;
    const observeAtTriggerLine = () => {
      observer?.disconnect();
      if (!('IntersectionObserver' in window)) return;
      const hiddenBottom = Math.max(0, rootBounds().height - revealTriggerLinePx(rootBounds().height));
      observer = new IntersectionObserver(onIntersect, {
        root: scrollRoot,
        rootMargin: `0px 0px -${hiddenBottom}px 0px`,
        threshold: 0,
      });
      observer.observe(node);
    };

    const checkScrollPosition = () => {
      frame = 0;
      const top = currentTop();
      if (top >= rootBounds().height) updateVisible(false);
      else if (top <= revealTriggerLinePx(rootBounds().height)) updateVisible(true);
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(checkScrollPosition);
    };
    const handleResize = () => {
      const nextRoot = getScrollableSiteRoot();
      if (nextRoot !== scrollRoot) {
        scrollTarget.removeEventListener('scroll', handleScroll);
        scrollRoot = nextRoot;
        scrollTarget = scrollRoot ?? window;
        scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
      }
      observeAtTriggerLine();
      handleScroll();
    };
    const handleMotionPreference = () => {
      if (reduceMotion.matches) updateVisible(true);
      else updateVisible(currentTop() <= revealTriggerLinePx(rootBounds().height));
    };

    observeAtTriggerLine();
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    reduceMotion.addEventListener('change', handleMotionPreference);

    return () => {
      observer?.disconnect();
      scrollTarget.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      reduceMotion.removeEventListener('change', handleMotionPreference);
      if (frame) window.cancelAnimationFrame(frame);
      if (armFrame) window.cancelAnimationFrame(armFrame);
    };
  }, []);

  return (
    <div
      id={id}
      ref={ref}
      className={['scroll-reveal', className].filter(Boolean).join(' ')}
      data-ready={ready ? 'true' : undefined}
      data-armed={armed ? 'true' : undefined}
      data-visible={visible ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
