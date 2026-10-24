import Link from 'next/link';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { AdminNav } from '@/components/admin-nav';
import { countAdmins, listUsers, toPublic } from '@/lib/users';
import { listGroupOptions } from '@/lib/groups';
import { AdminUsers } from '@/components/admin-users';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const gate = await getAdminGate();
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const [users, adminCount, groups] = await Promise.all([
    listUsers(),
    countAdmins(),
    listGroupOptions(),
  ]);
  const items = users
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((u) => ({ ...toPublic(u), lastLoginAt: u.lastLoginAt }));

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">用户</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            角色与封禁立即生效；封禁会让该账号的现有会话直接失效。身份组决定发帖 / 评论等具体权限。
          </p>
        </div>
        <Link href="/admin" className="btn btn-sm btn-ghost">
          返回概览
        </Link>
      </div>

      <AdminNav />

      <AdminUsers
        items={items}
        meId={gate.user?.id ?? null}
        adminCount={adminCount}
        groups={groups}
      />
    </div>
  );
}
