import { getOpsGate } from '@/lib/ops-auth';
import { buildMetadata } from '@/lib/seo';
import { AdminTitles } from '@/components/admin-titles';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '头衔审核', noIndex: true });
}

export default async function OpsTitlesPage() {
  const gate = await getOpsGate();
  if (!gate.ok) return null;

  return (
    <>
      <div className="ops-page-head">
        <h1 className="page-title">头衔审核</h1>
        <p className="small muted">
          通过时可以改文案与样式，用户拿到的是这里最终定下的那一版。
        </p>
      </div>
      <AdminTitles />
    </>
  );
}
