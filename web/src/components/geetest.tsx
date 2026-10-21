'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * GeeTest v4 行为验证。
 *
 * 只在浏览器加载 gt4.js；服务端二次校验在 /api/v1/auth/* 里做，
 * 这里拿到的票据本身不代表通过，只代表"人机交互完成"。
 *
 * 线上踩过的坑都在这处理了：
 *  - gt4.js 在 CDN 上，被墙/超时会白屏 → 多源回退 + 6s 超时 + 可重试按钮
 *  - initGeetest4 静默失败（域名未登记）→ 3s 看门狗检查容器是否真的渲染出节点
 *  - 只配 ID 没配 KEY 时服务端会跳过校验 → 那种情况下父组件不传 captchaId，这里不渲染
 */

export interface CaptchaPayload {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
}

interface Props {
  captchaId: string;
  onChange: (payload: CaptchaPayload | null) => void;
  /** 换值即重建实例，用于提交失败后重置 */
  resetKey: number;
}

const CDN = ['https://static.geetest.com/v4/gt4.js', 'https://static.geetest.com.cn/v4/gt4.js'];

let loading: Promise<void> | null = null;

function loadScript(src: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      s.onload = null;
      s.onerror = null;
    }

    s.src = src;
    s.async = true;
    s.onload = () => {
      cleanup();
      resolve();
    };
    s.onerror = () => {
      cleanup();
      reject(new Error('load_error'));
    };
    document.head.appendChild(s);
  });
}

/** 依次尝试多个 CDN，成功后缓存 Promise；全部失败则清空缓存以便重试 */
function loadGt4(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as unknown as { initGeetest4?: unknown }).initGeetest4) return Promise.resolve();
  if (loading) return loading;

  loading = (async () => {
    for (const src of CDN) {
      try {
        await loadScript(src);
        if ((window as unknown as { initGeetest4?: unknown }).initGeetest4) return;
      } catch {
        // 换下一个源
      }
    }
    loading = null;
    throw new Error('gt4_unavailable');
  })();

  return loading;
}

export function Geetest({ captchaId, onChange, resetKey }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let disposed = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    changeRef.current(null);
    setStatus('loading');

    loadGt4()
      .then(() => {
        if (disposed || !box.current) return;
        box.current.innerHTML = '';

        const init = (
          window as unknown as {
            initGeetest4: (
              cfg: Record<string, unknown>,
              cb: (captcha: {
                appendTo: (el: HTMLElement) => void;
                onSuccess: (fn: () => void) => void;
                onError?: (fn: () => void) => void;
                onClose?: (fn: () => void) => void;
                getValidate: () => CaptchaPayload | null;
              }) => void,
            ) => void;
          }
        ).initGeetest4;

        init({ captchaId, product: 'bind', hideBar: ['close'], language: 'zho' }, (captcha) => {
          if (disposed || !box.current) return;
          captcha.appendTo(box.current);

          // 看门狗：初始化回调跑完了，容器里却没有任何节点 → 多半是 ID 无效或域名未登记
          watchdog = setTimeout(() => {
            if (disposed || !box.current) return;
            if (box.current.childElementCount === 0) setStatus('failed');
          }, 3000);

          captcha.onSuccess(() => {
            const v = captcha.getValidate();
            changeRef.current(v ?? null);
          });
          captcha.onError?.(() => changeRef.current(null));
          captcha.onClose?.(() => changeRef.current(null));
          setStatus('ready');
        });
      })
      .catch(() => {
        if (!disposed) setStatus('failed');
      });

    return () => {
      disposed = true;
      if (watchdog) clearTimeout(watchdog);
    };
  }, [captchaId, resetKey, attempt]);

  if (status === 'failed') {
    return (
      <div className="gt-fallback">
        <div>
          <b>人机验证加载失败</b>
          <p>多半是网络访问不到 static.geetest.com，或该域名未在 GeeTest 后台登记。</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={retry}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="gt-wrap">
      <div ref={box} className="gt-box" data-gt={captchaId} />
      {status === 'loading' && <span className="gt-hint">正在加载人机验证…</span>}
    </div>
  );
}
