import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNews } from '@/components/admin-news';

export const dynamic = 'force-dynamic';

export default async function AdminNewsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">新闻</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            发布后会出现在前台 /news。栏目顺序就是报刊的版面顺序；「预览报刊」按时间区间现场拼版。
          </p>
        </div>
      </div>

      <AdminNews />
    </div>
  );
}
