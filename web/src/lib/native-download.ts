/**
 * APK 内的下载出口。
 *
 * WebView 不会自己处理 Content-Disposition，点 `<a download>` 什么也不会发生，
 * 所以装了原生桥（App 注入的 `Capacitor.Plugins.FileBridge` 兼容层）时改走系统 DownloadManager：
 * 文件落到「下载」目录，通知栏有进度，会话 Cookie 由原生侧从 WebView 取。
 *
 * 浏览器里没有这个桥，返回 false，调用方继续用原来的 a 标签。
 */

interface FileBridge {
  saveUrlToDownloads?: (opts: {
    url: string;
    filename?: string;
    mime?: string;
  }) => Promise<{ id?: number; filename?: string }>;
}

interface CapWindow {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { FileBridge?: FileBridge };
  };
}

export function nativeFileBridge(): FileBridge | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as CapWindow).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.FileBridge ?? null;
}

/** 交给原生下载；成功返回 true。任何异常都退回浏览器语义，不阻塞原来的按钮。 */
export async function nativeSaveUrl(
  url: string,
  filename?: string,
  mime?: string,
): Promise<boolean> {
  const bridge = nativeFileBridge();
  if (!bridge?.saveUrlToDownloads) return false;
  try {
    await bridge.saveUrlToDownloads({ url, filename, mime });
    return true;
  } catch {
    return false;
  }
}
