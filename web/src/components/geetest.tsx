'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * GeeTest v4 行为验证（bind 模式）。
 *
 * **bind 模式不能用 `appendTo`**：官方文档写明「此时 appendTo 接口调用将无效，
 * 验证时调用 showCaptcha 实例方法进行验证」。之前这里用 `bind + appendTo`，
 * 结果 gt4.js 和 gcaptcha4.css 都正常加载，容器里却始终是空的 —— 看起来就是
 * 「人机验证弹不出来」，提交时后端只能报「人机验证未通过」。
 *
 * 现在的交互：组件自己渲染一个「点击完成人机验证」按钮 → 调 `showCaptcha()`
 * 弹出极验的验证层 → `onSuccess` 取票据交给父组件 → 父组件随表单一起提交。
 *
 * 另外处理了线上常见的坑：
 *  - gt4.js 在 CDN 上，被墙/超时会白屏 → 多源回退 + 6s 脚本超时 + 可重试
 *  - 初始化成功但 onReady 迟迟不来 → 8s 看门狗，显示失败与重试
 *  - 在弹窗/Portal 里挂载会被卸载重建 → 每次都 destroy 旧实例，避免实例泄漏
 */

export interface CaptchaPayload {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
}

interface GtInstance {
  onReady: (fn: () => void) => GtInstance;
  onSuccess: (fn: () => void) => GtInstance;
  onError?: (fn: (err?: { code?: string; msg?: string }) => void) => GtInstance;
  /** 仅 bind 模式有效；未进入 onReady 前调用不会有反应 */
  showCaptcha: () => void;
  /** 成功时返回票据，其它情况返回 false */
  getValidate: () => CaptchaPayload | false | null;
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
  const inst = useRef<GtInstance | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [passed, setPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let disposed = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    changeRef.current(null);
    setStatus('loading');
    setPassed(false);
    setError(null);

    loadGt4()
      .then(() => {
        if (disposed) return;

        const init = (
          window as unknown as {
            initGeetest4: (
              cfg: Record<string, unknown>,
              cb: (captcha: GtInstance) => void,
            ) => void;
          }
        ).initGeetest4;

        if (typeof init !== 'function') {
          setStatus('failed');
          return;
        }

        // onReady 一直不来（captchaId 无效 / 域名未登记 / init 回调都不执行）时兜底
        watchdog = setTimeout(() => {
          if (disposed) return;
          setStatus((s) => (s === 'loading' ? 'failed' : s));
        }, 8000);

        try {
          // bind：不要 appendTo，只注册回调，由下面的按钮调 showCaptcha 弹出验证层
          init(
            { captchaId, product: 'bind', language: 'zho', hideSuccess: true },
            (captcha) => {
              if (disposed) return;
              inst.current = captcha;

              captcha.onReady(() => {
                if (disposed) return;
                if (watchdog) clearTimeout(watchdog);
                setStatus('ready');
              });

              captcha.onSuccess(() => {
                if (disposed) return;
                const v = captcha.getValidate();
                if (!v) return;
                changeRef.current(v);
                setPassed(true);
                setError(null);
              });

              captcha.onError?.((err) => {
                if (disposed) return;
                changeRef.current(null);
                setPassed(false);
                setStatus('failed');
                setError(err?.msg || '验证出错，请重新加载');
              });

              // 不监听 onClose：成功后弹层自动关闭也可能触发它，
              // 那时候把票据清掉会出现「显示已完成、提交却说没验证」的怪状态。
            },
          );
        } catch {
          setStatus('failed');
        }
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
    setPassed(false);
    setError(null);
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

  /** 打开极验验证层（bind 模式唯一的显示入口） */
  function open() {
    try {
      inst.current?.showCaptcha();
    } catch {
      retry();
    }
  }

  /** 重新验证：bind 模式成功后再次 showCaptcha 会自动重置，无需先 reset */
  function again() {
    changeRef.current(null);
    setPassed(false);
    setError(null);
    open();
  }

  if (status === 'failed') {
    return (
      <div className="gt-fallback">
        <div>
          <b>验证没有加载出来</b>
          <p>{error || '检查一下网络，或确认验证配置（域名白名单 / v4 ID）。'}</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={retry}>
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="gt-wrap">
      {passed ? (
        <div className="gt-done">
          <span className="gt-check" aria-hidden="true">
            ✓
          </span>
          <span>已完成人机验证</span>
          <button type="button" className="gt-redo" onClick={again}>
            重新验证
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="gt-trigger"
          disabled={status !== 'ready'}
          onClick={open}
        >
          {status === 'ready' ? '点击完成人机验证' : '正在准备验证…'}
        </button>
      )}
    </div>
  );
}
