import type { EarnedBadge } from '@/lib/achievements';

/** 徽章胶囊：个人主页与作者卡片共用 */
export function AchievementChips({ badges, size }: { badges?: EarnedBadge[]; size?: 'sm' }) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className="bz-list">
      {badges.map((b) => (
        <span key={b.id} className="bz" data-tone={b.tone} data-size={size} title={b.desc}>
          {b.name}
        </span>
      ))}
    </span>
  );
}
