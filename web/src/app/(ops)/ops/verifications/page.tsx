import { getOpsGate } from '@/lib/ops-auth';
import { buildMetadata } from '@/lib/seo';
import { AdminVerifications } from '@/components/admin-verifications';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '认证审核', noIndex: true });
}

export default async function OpsVerificationsPage() {
  const gate = await getOpsGate();
  if (!gate.ok) return null;

  return (
    <>
      <div className="ops-page-head">
        <h1 className="page-title">认证审核</h1>
        <p className="small muted">
          通过后会在昵称旁显示蓝标或红标；说明文字会作为悬停提示。
        </p>
      </div>
      {/* 「直接授予」要改用户字段，那是管理员权限，运营面板不开放 */}
      <AdminVerifications canGrant={false} />
    </>
  );
}
