import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android 壳：直接加载线上站点。
 * 把 https://your-domain.example 换成实际地址，并把域名加入 allowNavigation。
 */
const appUrl = process.env.APP_URL || 'https://your-domain.example';
const appHost = (() => {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return 'your-domain.example';
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
