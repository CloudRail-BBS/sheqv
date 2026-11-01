import type { LevelInfo, Reputation } from '@/lib/users';

/**
 * 等级 / 信誉的小标签。
 *
 * 纯展示组件（无 'use client'），服务端页面和客户端悬浮卡都能直接用。
 * 颜色只走状态色：等级用蓝、信誉按档位分绿/蓝/黄/红。
 */
export function LevelPill({ level, size = 'sm' }: { level?: LevelInfo; size?: 'sm' | 'lg' }) {
  if (!level) return null;
  // 参考 B 站的等级牌：六边形 + 渐变，颜色按段位走（蓝 → 青 → 绿 → 紫 → 红）
  const tier = Math.min(level.level, 6);
  return (
    <span className="lv-pill" data-size={size} data-lv={tier} title={`${level.title} · 累计 ${level.exp} 积分`}>
      <span className="lv-badge">
        <i>LV</i>
        <b>{level.level}</b>
      </span>
      {size === 'lg' && <span className="lv-name">{level.title}</span>}
    </span>
  );
}

const REP_TONE: Record<string, string> = {
  优秀: 'green',
  良好: 'blue',
  正常: 'neutral',
  待观察: 'amber',
  受限: 'red',
};

export function RepPill({ rep, size = 'sm' }: { rep?: Reputation; size?: 'sm' | 'lg' }) {
  if (!rep) return null;
  return (
    <span
      className="rep-pill"
      data-tone={REP_TONE[rep.tier] ?? 'neutral'}
      data-size={size}
      title={rep.hint}
    >
      <span className="rep-dot" aria-hidden="true" />
      信誉 {rep.score}
      {size === 'lg' && <i>{rep.tier}</i>}
    </span>
  );
}

/** 本级进度条：按累计获得积分算，显示「还差多少分升级」 */
export function LevelBar({ level }: { level?: LevelInfo }) {
  if (!level) return null;
  const maxed = level.nextAt <= level.exp;
  return (
    <div className="lv-bar-wrap">
      <div className="lv-bar" role="progressbar" aria-valuenow={level.progress} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${level.progress}%` }} />
      </div>
      <div className="lv-bar-text">
        <span>
          累计 <b>{level.exp}</b> / {level.nextAt} 积分
        </span>
        <span>{maxed ? '已满级' : `距 Lv.${level.level + 1} 还差 ${level.nextAt - level.exp}`}</span>
      </div>
    </div>
  );
}
