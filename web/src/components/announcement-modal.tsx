'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

export interface ModalAnnouncement {
  id: string;
  title: string;
  body: string;
  kind: string;
}

const SEEN_KEY = 'crbbs-ann-seen';

/**
 * 公告弹窗。
 *
 * 顶栏下面那条公告条只在用户主动看时才注意得到；重要公告（规则变更、版本更新）
 * 需要在进站时弹一次。同一条公告只弹一次，按 id 记在本地（和公告条的关闭状态分开存，
 * 关掉弹窗后顶部那条仍然在，用户回头还找得到）。
 */
export function AnnouncementModal({ item }: { item?: ModalAnnouncement }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!item) return;
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      const seen: string[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(seen) && seen.includes(item.id)) return;
    } catch {
      // 本地存储不可用（隐私模式）就当没看过，弹一次也无妨
    }
    setOpen(true);
  }, [item]);

  // 打开时锁滚动，关闭后还原
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function dismiss() {
    if (item) {
      try {
        const raw = window.localStorage.getItem(SEEN_KEY);
        const seen: string[] = raw ? JSON.parse(raw) : [];
        const next = [item.id, ...(Array.isArray(seen) ? seen : [])].slice(0, 30);
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // 存不了就算了，最多下次再弹一次
      }
    }
    setOpen(false);
  }

  if (!mounted || !item || !open) return null;

  const excerpt = item.body
    .replace(/[#>*_`[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  return createPortal(
    <div
      className="ann-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ann-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="ann-modal">
        <div className="ann-modal-head">
          <span className="ann-modal-kind">{item.kind}</span>
          <b id="ann-modal-title">{item.title}</b>
        </div>
        <p className="ann-modal-body">{excerpt || '公告内容见详情。'}</p>
        <div className="ann-modal-foot">
          <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>
            知道了
          </button>
          <Link href={`/announcements/${item.id}`} className="btn btn-sm btn-primary" onClick={dismiss}>
            查看全文
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
