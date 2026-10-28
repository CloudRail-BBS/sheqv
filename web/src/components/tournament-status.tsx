import { TOURNAMENT_STATUS_LABEL, type TournamentStatus } from '@/lib/task-types';

/**
 * 赛事状态徽章。
 *
 * 状态是有「活的」和「死的」之分的，所以不只换颜色：
 * 报名中带一个呼吸点（正在收人）、进行中带一个静态点、草稿用虚线描边、已结束降到最弱。
 * 列表、详情、后台共用这一个组件，避免三处各写一套映射。
 */

const TONE: Record<TournamentStatus, string> = {
  draft: 'badge badge-outline',
  signup: 'badge badge-live',
  running: 'badge badge-warn',
  ended: 'badge badge-ghost',
};

export function TournamentStatusBadge({
  status,
  size,
}: {
  status: TournamentStatus;
  size?: 'lg';
}) {
  const dot = status === 'signup' ? 'pulse' : status === 'running' ? '' : undefined;
  return (
    <span
      className={`${TONE[status]}${size === 'lg' ? ' badge-lg' : ''}`}
      data-dot={dot}
      data-glow={status === 'signup' || status === 'running' ? '' : undefined}
    >
      {TOURNAMENT_STATUS_LABEL[status]}
    </span>
  );
}
