import Link from 'next/link';

/**
 * 空状态。
 *
 * 站点从零开始时，每个列表页都应该给出"现在能做什么"，而不是一片空白。
 * 这是生产可用性的一部分：空数组不是异常，是正常初始状态。
 */
export function EmptyState({
  title,
  desc,
  actionHref,
  actionLabel,
  icon,
}: {
  title: string;
  desc: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: 'box' | 'users' | 'sword' | 'bell' | 'chart' | 'trophy';
}) {
  return (
    <div className="card empty-state">
      <div className="empty-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26">
          {icon === 'users' ? (
            <path
              d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11Zm7.5.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM3 19.5a6 6 0 0 1 12 0M16.5 19.5a5 5 0 0 1 4.5-4.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : icon === 'sword' ? (
            <path
              d="M5 4v6a7 7 0 0 0 14 0V4M8 4h8M12 17v3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : icon === 'bell' ? (
            <path
              d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : icon === 'trophy' ? (
            <path
              d="M8 4h8v5a4 4 0 0 1-8 0zM8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M10 17h4M12 13v4M9 20h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : icon === 'chart' ? (
            <path
              d="M4 20V6M4 20h16M8 17v-4M12 17V9M16 17v-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16v13H4zM4 7l2-3h12l2 3M9 12h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn btn-primary btn-sm">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
