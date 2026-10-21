import type { SiteSettings } from '@/lib/settings';

/**
 * 站点标识。
 *
 * 优先用后台设置的图片，其次用自定义文字，最后回落到站点名首字。
 * 只接受 http(s) 或站内路径（写入时已校验），避免后台被填入 javascript: 之类。
 */
export function BrandMark({ settings }: { settings: SiteSettings }) {
  const custom = (settings.logoText ?? '').trim();
  // 没自定义时只用首字（和改版前一致）；自定义最多两个字
  const text = custom
    ? Array.from(custom).slice(0, 2).join('')
    : Array.from((settings.siteName || '方').trim()).slice(0, 1).join('');
  const image = settings.logoImage.trim();

  if (image) {
    return (
      <span className="brand-mark" data-kind="image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={settings.siteName} loading="eager" decoding="async" />
      </span>
    );
  }

  return (
    <span className="brand-mark" data-len={Array.from(text).length}>
      {text}
    </span>
  );
}
