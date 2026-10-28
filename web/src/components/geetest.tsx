'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * GeeTest v4 行为验证。
 *
 * 只在浏览器加载 gt4.js；服务端二次校验在 /api/v1/auth/* 里做，
 * 这里拿到的票据本身不代表通过，只代表"人机交互完成"。
 *
 * 线上踩过的坑都在这处理了：
 *  - gt4.js 在 CDN 上，被墙/超时会白屏 → 多源回退 + 6s 超时 + 可重试
 *  - initGeetest4 静默失败（域名未登记）→ 4s 看门狗检查容器里有没有真实节点
 *  - 容器用 flex 居中会把注入的组件压成 0 宽 → 这里只给块级容器，布局交给 GeeTest
 */

export interface CaptchaPayload {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
}

interface GtInstance {
  appendTo: (el: HTMLElement) => void;
  onSuccess: (fn: () => void) => void;
  onError?: (fn: () => void) => void;
  onClose?: (fn: () => void) => void;
  getValidate: () => CaptchaPayload | null;
  reset?: () => void;
  destroy?: () => void;
}

interface Props {
  captchaId: string;
  onChange: (payload: CaptchaPayload | null) => void;
  /** 换值即重置实例，用于提交失败后重来 */
  resetKey: number;
}

// gt4.js 会自己拉 gcaptcha4.css。那份样式里带大量 IE 时代的写法
// （`\9`、`*width`、`filter:alpha`、`-o-min-device-pixel-ratio`、`-ms-clear`），
// Firefox 会逐条警告「解析…的值时出错」。这是正常噪声，不影响组件渲染，
// 资源在 GeeTest 的 CDN 上，无法在不动第三方资源的前提下去掉。
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
  const inst = useRef<GtInstance | null>(null);
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
            initGeetest4: (cfg: Record<string, unknown>, cb: (captcha: GtInstance) => void) => void;
          }
        ).initGeetest4;

        if (typeof init !== 'function') {
          setStatus('failed');
          return;
        }

        // bind 直接把验证组件嵌进容器；float 的悬浮按钮在弹窗里容易被裁掉
        init({ captchaId, product: 'bind', hideBar: ['close'], language: 'zho' }, (captcha) => {
          if (disposed || !box.current) return;
          inst.current = captcha;

          try {
            captcha.appendTo(box.current);
          } catch {
            setStatus('failed');
            return;
          }

          captcha.onSuccess(() => changeRef.current(captcha.getValidate() ?? null));
          captcha.onError?.(() => changeRef.current(null));
          captcha.onClose?.(() => changeRef.current(null));
          setStatus('ready');

          // 看门狗：回调跑完了容器里却没有节点 → 多半是 ID 无效或域名未登记
          watchdog = setTimeout(() => {
            if (disposed || !box.current) return;
            if (box.current.childElementCount === 0) setStatus('failed');
          }, 4000);
        });
      })
      .catch(() => {
        if (!disposed) setStatus('failed');
      });

    return () => {
      disposed = true;
      if (watchdog) clearTimeout(watchdog);
      try {
        inst.current?.destroy?.();
      } catch {
        // 组件卸载时忽略
      }
      inst.current = null;
    };
  }, [captchaId, attempt]);

  // 提交失败后重置：优先复用实例，实例不可用才重建
  useEffect(() => {
    if (resetKey === 0) return;
    changeRef.current(null);
    const c = inst.current;
    if (c?.reset) {
      try {
        c.reset();
        return;
      } catch {
        // 落到重建
      }
    }
    setAttempt((n) => n + 1);
  }, [resetKey]);

  if (status === 'failed') {
    return (
      <div className="gt-fallback">
        <div>
          <b>验证没有加载出来</b>
          <p>检查一下网络，或稍后再试。</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={retry}>
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="gt-wrap">
      <div ref={box} className="gt-box" data-gt={captchaId} aria-live="polite" />
      {status === 'loading' && <span className="gt-hint">正在准备验证…</span>}
    </div>
  );
}
