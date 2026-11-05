import { getOpsGate } from '@/lib/ops-auth';
import { buildMetadata } from '@/lib/seo';
import { OpsServers } from '@/components/ops-servers';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '服务器审核', noIndex: true });
}

export default async function OpsServersPage() {
  const gate = await getOpsGate();
  if (!gate.ok) return null;

  return (
    <>
      <div className="ops-page-head">
        <h1 className="page-title">服务器审核</h1>
        <p className="small muted">
          玩家提交的联机大厅条目。通过后探测会自动开始；拒绝会通知提交者，改完可以重新提交。
        </p>
      </div>
      <OpsServers />
    </>
  );
}
