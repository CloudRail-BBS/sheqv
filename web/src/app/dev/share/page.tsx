import { notFound } from 'next/navigation';
import { config } from '@/lib/config';
import { SharePreview } from '@/components/share-preview';

export const dynamic = 'force-dynamic';

/** 开发用：三张导出图的版式预览（生产默认 404） */
export default function SharePreviewPage() {
  if (!config.devConsole) notFound();

  return (
    <div className="col-main">
      <h1 className="page-title">分享图预览</h1>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 16 }}>
        调版式用的静态样例，和页面上导出的 PNG 是同一套绘制代码。
      </p>
      <SharePreview />
    </div>
  );
}
