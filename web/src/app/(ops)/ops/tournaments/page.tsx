import { getOpsGate } from '@/lib/ops-auth';
import { buildMetadata } from '@/lib/seo';
import { OpsTournaments } from '@/components/ops-tournaments';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '赛事报名', noIndex: true });
}

export default async function OpsTournamentsPage() {
  const gate = await getOpsGate();
  if (!gate.ok) return null;

  return (
    <>
      <div className="ops-page-head">
        <h1 className="page-title">赛事报名</h1>
        <p className="small muted">
          跨赛事汇总的报名。通过才占名额；拒绝后报名者可以补充资料重新提交。
        </p>
      </div>
      <OpsTournaments />
    </>
  );
}
