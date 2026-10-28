import { VERIFY_KIND_META, isVerifyKind } from '@/lib/verify-types';

/**
 * 认证印记：蓝标（个人）/ 红标（机构）。
 *
 * 只认后端的枚举值，颜色与形状在 CSS 与下面的 path 里定死，用户与前端都改不了。
 * 蓝标用圆形、红标用八角星，所以即使色觉不同也能靠轮廓区分。
 */
export function VerifyMark({
  kind,
  label,
  size = 'sm',
}: {
  kind?: string;
  label?: string;
  size?: 'sm' | 'lg';
}) {
  if (!isVerifyKind(kind)) return null;
  const meta = VERIFY_KIND_META[kind];
  const text = label?.trim() ? `${meta.label} · ${label.trim()}` : meta.label;

  return (
    <span
      className="vmark"
      data-vk={kind}
      data-size={size}
      role="img"
      aria-label={text}
      title={text}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {kind === 'red' ? (
          <path
            d="M12 1.9l2.5 1.9 3.1-.2.8 3 2.6 1.7-1 3 1 3-2.6 1.7-.8 3-3.1-.2L12 22.7l-2.5-1.9-3.1.2-.8-3L3 16.3l1-3-1-3 2.6-1.7.8-3 3.1.2z"
            fill="currentColor"
          />
        ) : (
          <circle cx="12" cy="12" r="10" fill="currentColor" />
        )}
        {/* 对勾的颜色走 CSS：SVG 表现属性里的 var() 在部分浏览器不生效 */}
        <path
          className="vmark-tick"
          d="M7.5 12.3l3.1 3 5.9-6.1"
          fill="none"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
