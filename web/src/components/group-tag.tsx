import type { UserGroup } from '@/lib/users';

/**
 * 名字旁边的身份组标签。
 *
 * 颜色来自后台设置（普通用户改不了）。用同色系的淡底 + 描边，
 * 深浅主题都能读；没有颜色（未分组或老数据）就退化成中性灰。
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
  const bg = rgba(color, 0.13) ?? 'rgba(100, 116, 139, 0.13)';
  const border = rgba(color, 0.36) ?? 'rgba(100, 116, 139, 0.36)';

  return (
    <span
      className="gtag"
      data-size={size}
      style={{ color, background: bg, borderColor: border }}
      title={title ?? `身份组：${group.name}`}
    >
      <i style={{ background: color }} aria-hidden="true" />
      {group.name}
    </span>
  );
}
