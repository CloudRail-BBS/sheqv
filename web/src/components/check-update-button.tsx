'use client';

import { useEffect, useState } from 'react';

/**
 * 「检查更新」按钮。
 *
 * 只在客户端里出现（网页版没有安装包概念，点了也无意义）：
 * - Android 原生壳：调 `NativeApp.checkUpdate()`，由原生查接口、弹窗、下载、拉起安装器；
 * - 桌面端 / 浏览器：退回到「打开下载页最新版本」的普通链接行为。
 */
declare global {
  interface Window {
    NativeApp?: { checkUpdate?: () => void };
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

export function CheckUpdateButton() {
  const [native, setNative] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setNative(typeof window !== 'undefined' && typeof window.NativeApp?.checkUpdate === 'function');
  }, []);

  if (!native) return null;

  return (
    <span className="download-update">
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => {
          window.NativeApp?.checkUpdate?.();
          setMsg('已向客户端请求检查，稍等片刻');
          window.setTimeout(() => setMsg(''), 4000);
        }}
      >
        检查更新
      </button>
      {msg && <em className="small muted">{msg}</em>}
    </span>
  );
}
