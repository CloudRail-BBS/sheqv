import { VERIFY_KIND_META, isVerifyKind } from '@/lib/verify-types';

/**
 * 认证印记：蓝标（个人）/ 红标（机构）。
 *
 * 只认后端的枚举值，颜色与形状在 CSS 与下面的 path 里定死，用户与前端都改不了。
 * 蓝 / 红是「印章」：圆角方块 + 四个尖角，靠颜色区分；
 * 赞助者是「手掌与爱心」，图标是原图（web/public/badges/sponsor.png），
 * 用 mask 上色，这样和另外两枚一样只吃 currentColor。
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
      {kind === 'sponsor' ? (
        <span className="vmark-img" aria-hidden="true" />
      ) : (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {/* 印章底：圆角方块 + 四个尖角。两块同色填充，叠在一起就是一个轮廓 */}
        <rect x="4.1" y="4.1" width="15.8" height="15.8" rx="5" fill="currentColor" />
        <path
          d="M12 1.4 15.5 4.6h-7zM12 22.6 8.5 19.4h7zM1.4 12 4.6 8.5v7zM22.6 12 19.4 15.5v-7z"
          fill="currentColor"
        />
        {/* 对勾的颜色走 CSS：SVG 表现属性里的 var() 在部分浏览器不生效 */}
        <path
          className="vmark-tick"
          d="M7.6 12.2l3 3 5.8-6.1"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      )}
    </span>
  );
}
