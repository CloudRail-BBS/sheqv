export type AppPlatform = 'windows-x64' | 'windows-arm64' | 'macos-arm64' | 'macos-x64' | 'android';
export type AppChannel = 'stable' | 'beta';

export interface AppRelease {
  id: string;
  platform: AppPlatform;
  channel: AppChannel;
  version: string;
  build: number;
  downloadUrl: string;
  notes: string;
  forceUpdate: boolean;
  minVersion: string;
  published: boolean;
  fileSize: number;
  sha256: string;
  createdAt: string;
  updatedAt: string;
}

export const APP_PLATFORMS: { key: AppPlatform; label: string; group: string; hint: string }[] = [
  { key: 'windows-x64', label: 'Windows x64', group: 'Windows', hint: 'Windows 10/11 64 位' },
  { key: 'windows-arm64', label: 'Windows ARM64', group: 'Windows', hint: '骁龙 X 等 ARM 设备' },
  { key: 'macos-arm64', label: 'macOS Apple Silicon', group: 'macOS', hint: 'M1 / M2 / M3 / M4' },
  { key: 'macos-x64', label: 'macOS Intel', group: 'macOS', hint: 'Intel 芯片 Mac' },
  { key: 'android', label: 'Android APK', group: 'Android', hint: 'Android 8.0+' },
];

export const APP_CHANNELS: { key: AppChannel; label: string }[] = [
  { key: 'stable', label: '稳定版' },
  { key: 'beta', label: '测试版' },
];

export function platformLabel(key: string): string {
  return APP_PLATFORMS.find((p) => p.key === key)?.label ?? key;
}

export function fmtBytes(n: number): string {
  if (!n) return '—';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
