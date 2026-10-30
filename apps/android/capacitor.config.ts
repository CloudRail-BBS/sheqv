import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android 壳：直接加载线上站点。
 * 站点固定为 https://crbbsx.com；需要临时切换时用 APP_URL 覆盖。
 */
const appUrl = process.env.APP_URL || 'https://crbbsx.com';
const appHost = (() => {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return 'crbbsx.com';
  }
})();

const config: CapacitorConfig = {
  appId: 'com.cloudrail.community',
  appName: '云轨社区',
  webDir: 'www',
  server: {
    url: appUrl,
    cleartext: false,
    allowNavigation: [appHost],
    // 打不开线上站点时（没网 / DNS 失败），加载包内的离线预览页
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Keyboard: { resize: 'body' },
    StatusBar: { style: 'DARK' },
  },
};

export default config;
