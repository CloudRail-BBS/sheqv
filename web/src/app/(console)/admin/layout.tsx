import type { Metadata } from 'next';

/**
 * 后台整体不进搜索引擎。
 * 页面各自的标题仍由 `<title>` 决定，这里只加一条 robots 指令。
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
