import { getOpsGate } from '@/lib/ops-auth';
import { buildMetadata } from '@/lib/seo';
import { OpsMembers } from '@/components/ops-members';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '成员与禁言', noIndex: true });
}

export default async function OpsMembersPage() {
  const gate = await getOpsGate();
  if (!gate.ok) return null;

  return (
    <>
      <div className="ops-page-head">
        <h1 className="page-title">成员与禁言</h1>
        <p className="small muted">
          处理骚扰与刷屏。禁言期间不能发帖、评论、发私信，到期自动恢复。
        </p>
      </div>
      <OpsMembers />
    </>
  );
}
