'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { WikiEditor } from './wiki-editor';
import type { ContentCategory } from '@/lib/category-types';

/**
 * 百科投稿 / 编辑词条的弹窗外壳。
 *
 * 编辑器本身还是 `WikiEditor`：页面（/wiki/submit、/wiki/[slug]/edit）直接用它，
 * 前台入口则套这层弹窗，避免为写一条词条离开当前页面。
 * 弹窗 Portal 到 body，Esc / 点遮罩关闭，打开时锁滚动。
 */
export function WikiCompose({
  categories,
  captchaId = '',
  variant = 'btn',
  slug,
  initial,
  label,
}: {
  categories: ContentCategory[];
  captchaId?: string;
  /** btn = 页头按钮，fab = 手机悬浮按钮，text = 详情页「编辑词条」 */
  variant?: 'btn' | 'fab' | 'text';
  slug?: string;
  initial?: {
    title: string;
    summary: string;
    category: string;
    body: string;
    tags: string[];
  };
  label?: string;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => setMounted(true), []);

  /** 写了一半直接关掉太容易丢内容，改过就问一句 */
  function close() {
    if (dirty && !window.confirm('关闭后填写的内容不会保存，确定关闭吗？')) return;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  function openModal() {
    setDirty(false);
    setOpen(true);
  }

  const title = slug ? '编辑词条' : '投稿新词条';

  return (
    <>
      {variant === 'fab' ? (
        <button type="button" className="wiki-fab" onClick={openModal}>
          <span aria-hidden="true">+</span>
          {label ?? '投稿词条'}
        </button>
      ) : variant === 'text' ? (
        <button type="button" className="wiki-edit" onClick={openModal}>
          {label ?? '编辑词条'}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-primary wiki-submit-btn"
          onClick={openModal}
        >
          {label ?? '投稿'}
        </button>
      )}

      {mounted &&
        open &&
        createPortal(
          <div
            className="wiki-modal-mask"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              className="wiki-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wiki-modal-title"
            >
              <header className="wiki-modal-head">
                <div>
                  <b id="wiki-modal-title">{title}</b>
                  <span>提交后进入审核队列，管理员通过后公开</span>
                </div>
                <button
                  type="button"
                  className="wiki-modal-close"
                  aria-label="关闭"
                  onClick={close}
                >
                  ×
                </button>
              </header>
              <div className="wiki-modal-body">
                <WikiEditor
                  inModal
                  categories={categories}
                  captchaId={captchaId}
                  slug={slug}
                  initial={initial}
                  onCancel={close}
                  onDirtyChange={setDirty}
                  onSent={() => {
                    setOpen(false);
                    router.push('/wiki/mine?sent=1');
                    router.refresh();
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
