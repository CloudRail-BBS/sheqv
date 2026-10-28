'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 浏览器推送开关。
 *
 * 三件事必须按顺序做，少一步都订阅不上：
 * 1. 注册 Service Worker（`/sw.js`，scope 为站点根）；
 * 2. 通知权限拿到 granted；
 * 3. 用后端下发的 VAPID 公钥 `pushManager.subscribe`，再把订阅回传后端。
 *
 * iOS 只有「添加到主屏幕」后才支持，未满足时按钮直接说明原因，不要假装能开。
 */

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'busy';

function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

export function PushToggle({ variant = 'compact' }: { variant?: 'compact' | 'wide' }) {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    async function probe() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (alive) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (alive) setState('denied');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager.getSubscription();
        if (alive) setState(sub ? 'on' : 'off');
      } catch {
        if (alive) setState('off');
      }
    }
    void probe();
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setState('busy');
    setMsg('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        setMsg(permission === 'denied' ? '通知权限被浏览器拦下了，需要在站点设置里手动允许' : '');
        return;
      }

      const res = await fetch('/api/v1/push/key', { cache: 'no-store' });
      const data = (await res.json()) as { publicKey?: string };
      if (!res.ok || !data.publicKey) throw new Error('站点还没有准备好推送密钥');

      const reg = await registerWorker();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(data.publicKey),
      });

      const saved = await fetch('/api/v1/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), ua: navigator.userAgent }),
      });
      if (!saved.ok) throw new Error('订阅没保存成功，请稍后再试');

      setState('on');
      setMsg('已开启：有新消息会在这里弹出通知');
    } catch (e) {
      setState('off');
      setMsg(e instanceof Error ? e.message : '开启失败');
    }
  }, []);

  const disable = useCallback(async () => {
    setState('busy');
    setMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/v1/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
      setMsg('已关闭本站通知');
    } catch {
      setState('on');
      setMsg('关闭失败，请检查浏览器权限');
    }
  }, []);

  if (state === 'loading') {
    return variant === 'compact' ? (
      <span className="push-toggle is-loading" aria-hidden="true" />
    ) : (
      <div className="push-card muted small">正在检查推送状态…</div>
    );
  }

  const label =
    state === 'on' ? '通知已开' : state === 'denied' ? '通知被拦截' : state === 'unsupported' ? '不支持推送' : '通知';

  const sub =
    state === 'unsupported'
      ? '当前浏览器不支持网页推送；iOS 需要先「添加到主屏幕」再打开。'
      : state === 'denied'
        ? '浏览器已拒绝本站通知，请在地址栏左侧的站点设置里改回「允许」。'
        : state === 'on'
          ? '有新的公告、审核结果时会收到系统通知，可随时关闭。'
          : '开启后，即使页面没开着也能收到公告与审核结果提醒。';

  if (variant === 'compact') {
    const disabled = state === 'unsupported' || state === 'denied' || state === 'busy';
    return (
      <button
        type="button"
        className="push-toggle"
        data-on={state === 'on'}
        onClick={() => (state === 'on' ? void disable() : void enable())}
        disabled={disabled}
        title={sub}
        aria-label={label}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="hide-mobile">{label}</span>
      </button>
    );
  }

  return (
    <div className="push-card">
      <div className="push-card-main">
        <b>{label}</b>
        <span>{sub}</span>
        {msg && <em>{msg}</em>}
      </div>
      <button
        type="button"
        className={state === 'on' ? 'btn btn-sm btn-ghost' : 'btn btn-sm btn-primary'}
        onClick={() => (state === 'on' ? void disable() : void enable())}
        disabled={state === 'unsupported' || state === 'denied' || state === 'busy'}
      >
        {state === 'busy' ? '处理中…' : state === 'on' ? '关闭通知' : '开启通知'}
      </button>
    </div>
  );
}
