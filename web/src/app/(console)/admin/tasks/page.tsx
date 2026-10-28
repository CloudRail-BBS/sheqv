import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminTasks } from '@/components/admin-tasks';

export const dynamic = 'force-dynamic';

export default async function AdminTasksPage() {
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
          <h1 className="page-title">任务</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            任务进度按签到、发帖、评论、点赞、资源、服务器实时统计；这里只定义规则与奖励。
          </p>
        </div>
      </div>

      <AdminTasks />
    </div>
  );
}
