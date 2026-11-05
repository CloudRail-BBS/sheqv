import { getOpsGate } from '@/lib/ops-auth';
import { buildMetadata } from '@/lib/seo';
import { AdminAudit } from '@/components/admin-audit';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '帖子审核', noIndex: true });
}

export default async function OpsReviewPage() {
  const gate = await getOpsGate();
  if (!gate.ok) return null;

  return (
    <>
      <div className="ops-page-head">
        <h1 className="page-title">帖子审核</h1>
        <p className="small muted">
          待审帖子与资源都在这儿。AI 只给风险提示，最终判断由你来做。
        </p>
      </div>
      {/* 运营面板不提供「测试 AI 配置」，那是管理员调参用的 */}
      <AdminAudit canTest={false} />
    </>
  );
}
