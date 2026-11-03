'use client';

import { useState } from 'react';

/** UID 的外观。值是后端 users.uid_style 的枚举，别随便改。 */
export type UidStyle = 'plain' | 'mono' | 'solid' | 'gradient' | 'outline';

export const UID_STYLES: { key: UidStyle; name: string; note: string }[] = [
  { key: 'plain', name: '简洁', note: '浅灰底细边，最不抢眼' },
  { key: 'mono', name: '终端', note: '等宽 + 虚线，带 # 前缀' },
  { key: 'solid', name: '实色', note: '蓝底白字，一眼能看到' },
  { key: 'gradient', name: '渐变', note: '蓝紫渐变，社区里最跳' },
  { key: 'outline', name: '描边', note: '透明底 + 蓝边，轻盈' },
];

const STYLE_KEYS = UID_STYLES.map((s) => s.key);

export function isUidStyle(v: string | undefined): v is UidStyle {
  return Boolean(v && (STYLE_KEYS as string[]).includes(v));
}

/**
 * 把 UID 复制到剪贴板。
 * 非 https 或旧浏览器没有 navigator.clipboard，退回到临时 textarea。
 */
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 走下面的兜底
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * UID 徽标：个人主页给访客看、自己的页面看样式。
 * `copy` 打开后可点 / 回车复制，复制完短暂显示「已复制」。
 */
export function UidBadge({
  uid,
  style = 'plain',
  size = 'sm',
  copy = false,
  label = true,
}: {
  uid?: number;
  style?: string;
  size?: 'sm' | 'md';
  copy?: boolean;
  /** 是否显示前面的「UID」字样 */
  label?: boolean;
}) {
  const [done, setDone] = useState(false);

  if (!uid) return null;

  const tone = isUidStyle(style) ? style : 'plain';

  async function run() {
    if (!copy || !uid) return;
    const ok = await copyText(String(uid));
    if (!ok) return;
    setDone(true);
    window.setTimeout(() => setDone(false), 1400);
  }

  return (
    <span
      className="uidbadge"
      data-style={tone}
      data-size={size}
      data-copy={copy || undefined}
      role={copy ? 'button' : undefined}
      tabIndex={copy ? 0 : undefined}
      aria-label={copy ? `UID ${uid}，点击复制` : `UID ${uid}`}
      title={copy ? `UID ${uid} · 点击复制` : `UID ${uid}`}
      onClick={copy ? () => void run() : undefined}
      onKeyDown={
        copy
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void run();
              }
            }
          : undefined
      }
    >
      {label && <i aria-hidden="true">UID</i>}
      <b>{uid}</b>
      <span className="uidbadge-done" role="status" aria-live="polite">
        {done ? '已复制' : ''}
      </span>
    </span>
  );
}
