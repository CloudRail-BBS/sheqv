import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listConversations } from '@/lib/dm';
import { DmClient } from '@/components/dm-client';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);

  if (!user) {
    return (
      <div className="card card-pad" style={{ maxWidth: 460, marginTop: 8 }}>
        <h1 className="page-title" style={{ fontSize: 19 }}>
          私信需要登录
        </h1>
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
          登录后才能收发私信。私信只有你和对方能看到，管理员也读不到正文。
        </p>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <Link href="/login" className="btn btn-primary" style={{ flex: 1 }}>
            登录
          </Link>
          <Link href="/register" className="btn" style={{ flex: 1 }}>
            注册
          </Link>
        </div>
      </div>
    );
  }

  const items = await listConversations();

  return (
    <div className="dm-page">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">私信</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            一对一聊天，只有你和对方能看到。
          </p>
        </div>
        <span className="badge badge-ghost hide-mobile">最多 2000 字 / 条</span>
      </div>

      <DmClient initial={items} initialPeer={sp.to && sp.to !== user.id ? sp.to : undefined} />
    </div>
  );
}
