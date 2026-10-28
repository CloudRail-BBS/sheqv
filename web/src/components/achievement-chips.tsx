import type { EarnedBadge } from '@/lib/achievements';

/** tone → 默认样式：后台没配样式时沿用原来的语气色 */
const TONE_STYLE: Record<string, string> = {
  blue: 'blue',
  gold: 'gold',
  red: 'plain',
  gray: 'plain',
};

/** 徽章胶囊：个人主页与作者卡片共用 */
export function AchievementChips({ badges, size }: { badges?: EarnedBadge[]; size?: 'sm' }) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className="bz-list">
      {badges.map((b) => (
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
