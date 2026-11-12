import type { EarnedBadge } from '@/lib/achievements';

/** tone → 默认样式：后台没配样式时沿用原来的语气色 */
const TONE_STYLE: Record<string, string> = {
  blue: 'blue',
  gold: 'gold',
  red: 'plain',
  gray: 'plain',
};

/** 徽章胶囊：个人主页与作者卡片共用 */
export function AchievementChips({
  badges,
  size,
  skip,
}: {
  badges?: EarnedBadge[];
  size?: 'sm';
  /** 与头衔 / 身份组重名的成就不要再挂一遍（「管理员 管理员」） */
  skip?: Array<string | null | undefined>;
}) {
  if (!badges || badges.length === 0) return null;
  const blocked = new Set(
    (skip ?? []).filter((v): v is string => Boolean(v?.trim())).map((v) => v.trim().toLowerCase()),
  );
  const shown = blocked.size > 0 ? badges.filter((b) => !blocked.has(b.name.trim().toLowerCase())) : badges;
  if (shown.length === 0) return null;
  return (
    <span className="bz-list">
      {shown.map((b) => (
        <span
          key={b.id}
          className="bz"
          data-tone={b.tone}
          data-size={size}
          data-bs={b.style || TONE_STYLE[b.tone] || 'plain'}
          data-be={b.effect || undefined}
          title={b.desc}
        >
          {b.name}
        </span>
      ))}
    </span>
  );
}
