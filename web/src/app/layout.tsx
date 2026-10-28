import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getRequestCaps, getTheme } from '@/lib/request-caps';
import { CapProvider } from '@/components/cap-provider';
import { buildMetadata } from '@/lib/seo';

/**
 * 根布局只做三件事：`<html>` 属性、全局样式、能力上下文。
 *
 * 前台外壳（顶栏 / 侧栏 / 页脚 / 底部栏）在 `(site)/layout.tsx`，
 * 后台外壳在 `(console)/layout.tsx`。两边互不嵌套，
 * 后台不会再被前台的导航栏和页脚挤压。
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ root: true });
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
    { media: '(prefers-color-scheme: light)', color: '#f3f5f9' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [caps, theme] = await Promise.all([getRequestCaps(), getTheme()]);

  return (
    <html
      lang="zh-CN"
      data-theme={theme}
      data-runtime={caps.runtime}
      data-form={caps.form}
      data-wechat={caps.isWeChat ? 'true' : 'false'}
      suppressHydrationWarning
    >
      <body>
        <CapProvider state={caps}>{children}</CapProvider>
      </body>
    </html>
  );
}
