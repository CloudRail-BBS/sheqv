import type { UserGroup } from '@/lib/users';

/**
 * 名字旁边的身份组标签。
 *
 * 颜色来自后台设置（普通用户改不了），外观也由后台选：
 * - `soft`（默认）：淡底 + 同色描边
 * - `solid`：实心同色 + 白字
 * - `outline`：只描边
 * - `glow`：淡底 + 一圈同色光晕
 * 特效（扫光 / 光晕 / 呼吸）走通用 `data-be`，与头衔、徽章同一套实现。
 *
 * 纯展示组件，客户端组件也能引（不要在这里 import 服务端模块）。
 */

function rgba(hex: string, alpha: number): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function appearance(color: string, style: string): React.CSSProperties {
  const bg = rgba(color, 0.13);
  const border = rgba(color, 0.36);
  switch (style) {
    case 'solid':
      return { color: '#fff', background: color, borderColor: color };
    case 'outline':
      return { color, background: 'transparent', borderColor: rgba(color, 0.55) ?? color };
    case 'glow':
      return {
        color,
        background: bg ?? 'transparent',
        borderColor: border ?? color,
        boxShadow: `0 0 0 1px ${rgba(color, 0.18) ?? 'transparent'}, 0 6px 16px -8px ${color}`,
      };
    default:
      return { color, background: bg ?? 'transparent', borderColor: border ?? color };
  }
}

export function GroupTag({
  group,
  size,
  title,
}: {
  group?: UserGroup | null;
  size?: 'sm';
  title?: string;
}) {
  if (!group) return null;
  const color = group.color || '#64748b';
  const style = group.style || 'soft';

  return (
    <span
      className="gtag"
      data-size={size}
      data-gs={style}
      data-be={group.effect || undefined}
      style={appearance(color, style)}
      title={title ?? `身份组：${group.name}`}
    >
      <i style={{ background: style === 'solid' ? '#fff' : color }} aria-hidden="true" />
      {group.name}
    </span>
  );
}
