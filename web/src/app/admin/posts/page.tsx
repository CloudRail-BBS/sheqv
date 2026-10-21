import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { listPosts } from '@/lib/forum-store';
import { AdminPosts } from '@/components/admin-posts';

export const dynamic = 'force-dynamic';

export default async function AdminPostsPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const posts = await listPosts();

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">帖子</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            共 {posts.length} 条。删除会连带清理评论与点赞，不可撤销。
          </p>
        </div>
        <Link href="/" className="btn btn-sm btn-ghost">
          去社区
        </Link>
      </div>

      <AdminNav />

      <AdminPosts items={posts} />
    </div>
  );
}
