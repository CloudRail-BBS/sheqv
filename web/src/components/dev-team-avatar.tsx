import type { CSSProperties } from 'react';
import { initialOf } from '@/lib/initials';

/**
 * 开发团队头像。
 *
 * 有 logo 用图片，没有就回落到简称色块。两种形态尺寸一致，
 * 列表、详情、榜单与分享图都走这一套规则，避免某处忘记兜底。
 */
export function DevTeamAvatar({
  team,
  size = 42,
  className,
}: {
  team: { name: string; tag: string; color?: string; logo?: string };
  size?: number;
  className?: string;
}) {
  const radius = Math.max(6, Math.round(size * 0.24));
  const color = team.color || '#3e7cff';

  if (team.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={'dt-avatar' + (className ? ` ${className}` : '')}
        src={team.logo}
        alt={team.name}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <span
      className={'dt-mark' + (className ? ` ${className}` : '')}
      style={
        {
          width: size,
          height: size,
          borderRadius: radius,
          fontSize: Math.max(10, Math.round(size * 0.42)),
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
          borderColor: `color-mix(in srgb, ${color} 36%, transparent)`,
        } as CSSProperties
      }
      aria-label={team.name}
    >
      {initialOf(team.tag || team.name)}
    </span>
  );
}
