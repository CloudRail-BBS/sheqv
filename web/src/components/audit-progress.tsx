import Link from 'next/link';

export type AuditStatus = 'pending' | 'published' | 'rejected' | 'hidden';

const STATUS_TEXT: Record<AuditStatus, string> = {
  pending: '审核中',
  published: '已发布',
  rejected: '未通过',
  hidden: '已下架',
};

const STATUS_BADGE: Record<AuditStatus, string> = {
  pending: 'badge badge-warn',
  published: 'badge badge-ok',
  rejected: 'badge badge-danger',
  hidden: 'badge badge-ghost',
};

const fmt = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts + 8 * 3600 * 1000);
  return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}`;
};

/**
 * 审核进度。
 *
 * 三步固定：已提交 → 审核中 → 已发布。待审时第二步高亮，驳回时第三步变成红色，
 * 并把驳回原因摊开——用户最想知道的是「卡在哪、为什么、要改什么」。
 *
 * `compact` 用于列表行：只出一条进度条 + 状态，不占纵向空间。
 */
export function AuditProgress({
  status,
  createdAt,
  reviewedAt,
  rejectReason,
  href,
  compact = false,
}: {
  status: AuditStatus;
  createdAt?: number;
  reviewedAt?: number;
  rejectReason?: string | null;
  href?: string;
  compact?: boolean;
}) {
  const rejected = status === 'rejected';
  const done = status === 'published';
  const steps = [
    { key: '提交', state: 'done' as const, at: createdAt },
    {
      key: rejected ? '未通过' : done ? '已审核' : '审核中',
      state: rejected ? ('fail' as const) : done ? ('done' as const) : ('now' as const),
      at: reviewedAt,
    },
    { key: '发布', state: done ? ('done' as const) : ('wait' as const) },
  ];

  if (compact) {
    return (
      <span className="audit-mini" data-state={status}>
        <span className="audit-mini-bar">
          <i data-on="true" />
          <i data-on={rejected || done ? 'true' : undefined} data-fail={rejected || undefined} />
          <i data-on={done ? 'true' : undefined} />
        </span>
        <span className={STATUS_BADGE[status]}>{STATUS_TEXT[status]}</span>
      </span>
    );
  }

  return (
    <div className="audit-card" data-state={status}>
      <div className="audit-head">
        <b>审核进度</b>
        <span className={STATUS_BADGE[status]}>{STATUS_TEXT[status]}</span>
        {href && (
          <Link href={href} className="audit-link">
            查看内容 →
          </Link>
        )}
      </div>

      <ol className="audit-steps">
        {steps.map((s, i) => (
          <li key={s.key} className="audit-step" data-state={s.state}>
            <span className="audit-dot" aria-hidden="true">
              {s.state === 'done' ? '✓' : s.state === 'fail' ? '!' : i + 1}
            </span>
            <span className="audit-step-key">{s.key}</span>
            {s.at ? <span className="audit-step-at mono">{fmt(s.at)}</span> : null}
          </li>
        ))}
      </ol>

      <p className="audit-hint">
        {status === 'pending' && '已进入审核队列，通常会很快处理；通过后会出现在公开列表里。'}
        {status === 'published' && '已通过审核并公开，其他人现在可以看到。'}
        {status === 'rejected' && '这次没有通过，原因见下方；修改后可以重新提交。'}
        {status === 'hidden' && '内容已下架，只有你自己和管理员能看到。'}
      </p>

      {rejected && rejectReason && (
        <p className="audit-reason">
          <b>驳回原因</b>
          {rejectReason}
        </p>
      )}
    </div>
  );
}
