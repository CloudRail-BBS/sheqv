'use client';

import { useEffect, useRef } from 'react';

/**
 * GeeTest v4 组件。
 *
 * 只在浏览器里加载 gt4.js；服务端二次校验在 /api/v1/auth/* 里做，
 * 这里拿到的票据本身不代表通过，只代表"人机交互完成"。
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
  /** 换值即重建实例，用于失败后重置 */
  resetKey: number;
}

let loading: Promise<void> | null = null;

function loadGt4(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as unknown as { initGeetest4?: unknown }).initGeetest4) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://static.geetest.com/v4/gt4.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gt4.js 加载失败'));
    document.head.appendChild(s);
  });
  return loading;
}

export function Geetest({ captchaId, onChange, resetKey }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    changeRef.current(null);

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

        init({ captchaId, product: 'bind', hideBar: ['close'] }, (captcha) => {
          captcha.appendTo(box.current!);
          captcha.onSuccess(() => {
            const v = captcha.getValidate();
            changeRef.current(v ?? null);
          });
          captcha.onError?.(() => changeRef.current(null));
          captcha.onClose?.(() => changeRef.current(null));
        });
      })
      .catch(() => changeRef.current(null));

    return () => {
      disposed = true;
    };
  }, [captchaId, resetKey]);

  return <div ref={box} className="gt-box" data-gt={captchaId} />;
}
