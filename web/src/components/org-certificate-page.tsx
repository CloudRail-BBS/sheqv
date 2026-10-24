import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { getSettings } from '@/lib/settings';
import { getOrg } from '@/lib/orgs';
import { KIND_LABEL, type OrgKind } from '@/lib/org-types';
import { OrgCertificate } from '@/components/org-certificate';

/**
 * 证书页：**只给负责人本人和管理员**。
 *
 * 证书上有负责人昵称与编号，属于「证明文件」，不适合匿名可访问；
 * 但公会本身是公开的，所以不做 404 隐藏，直接说明为什么看不到。
 */
export async function OrgCertificatePage({ kind, id }: { kind: OrgKind; id: string }) {
  const org = await getOrg(kind, id);
  if (!org) notFound();

  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const label = KIND_LABEL[kind];
  const base = kind === 'guild' ? '/guilds' : '/teams';
  const allowed = Boolean(user && (user.id === org.ownerId || user.isAdmin));

  if (!allowed) {
    return (
      <div className="col-main">
        <div className="crumb">
          <Link href={base}>{label}</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <Link href={`${base}/${org.id}`}>{org.name}</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>证书</span>
        </div>
        <div className="card card-pad">
          <h1 className="page-title" style={{ fontSize: 20 }}>
            证书仅负责人可见
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            这张证书写的是负责人的名字，所以只有{label}负责人本人或管理员能打开。
            想看看这个{label}本身，可以回到详情页。
          </p>
          <Link href={`${base}/${org.id}`} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
            回到{label}详情
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="col-main">
      <div className="crumb no-print">
        <Link href={base}>{label}</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <Link href={`${base}/${org.id}`}>{org.name}</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>负责人证书</span>
      </div>

      <OrgCertificate
        org={org}
        ownerName={org.owner || user!.nickname}
        brand={settings.siteName || '方块竞技场'}
      />
    </div>
  );
}
