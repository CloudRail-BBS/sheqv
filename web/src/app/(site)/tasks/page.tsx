import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { getChrome } from '@/lib/chrome';
import { apiGetOr } from '@/lib/api-client';
import { TaskCenter } from '@/components/task-center';
import { buildMetadata } from '@/lib/seo';
import type { UserTask } from '@/lib/task-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '任务中心', path: '/tasks', noIndex: true });
}

export default async function TasksPage() {
  const user = await getCurrentUser();
  const hint = '完成日常与周常任务领取积分，进度按上海时区自动重置。';

  if (!user) {
    return (
      <div className="col-main">
        <h1 className="page-title">任务中心</h1>
        <div className="card card-pad" style={{ marginTop: 14, maxWidth: 480 }}>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            {hint} 需要登录后才能查看自己的进度。
          </p>
          <Link href="/login" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const [data, chrome] = await Promise.all([
    apiGetOr<{ items: UserTask[] }>('/api/v1/tasks', { items: [] }),
    getChrome(user),
  ]);

  return (
    <div className="col-main">
      <TaskCenter initial={data.items ?? []} initialPoints={chrome.points} />
    </div>
  );
}
