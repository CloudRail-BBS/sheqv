import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listMyDevTeams } from '@/lib/dev-team-store';
import { ResourceUpload } from '@/components/resource-upload';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '发布资源', path: '/resources/new', noIndex: true });
}

export default async function NewResourcePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="col-main">
        <h1 className="page-title">发布资源</h1>
        <div className="card card-pad" style={{ marginTop: 14, maxWidth: 460 }}>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            发布资源需要先登录。第一个资源发布后会自动获得「开发者」身份。
          </p>
          <Link href="/login" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const teams = await listMyDevTeams();

  return (
    <div className="col-main">
      <ResourceUpload
        defaultOpen
        teams={teams.map((t) => ({ id: t.id, name: t.name, tag: t.tag }))}
        nickname={user.nickname}
        avatar={user.avatar}
      />
    </div>
  );
}
