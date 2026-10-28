import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTournament } from '@/lib/tournament-store';
import { getCurrentUser } from '@/lib/current-user';
import { getSettings } from '@/lib/settings';
import { certificateDisclaimer } from '@/lib/policy-store';
import { buildMetadata } from '@/lib/seo';
import { TournamentCertificate, type CertRole } from '@/components/tournament-certificate';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTournament(id).catch(() => null);
  return buildMetadata({
    title: detail ? `${detail.item.title} · 证书` : '赛事证书',
    path: `/tournaments/${id}/certificate`,
    noIndex: true,
  });
}

/**
 * 赛事证书页。
 *
 * 两类人可领：主办账号（办赛）与审核通过的参赛者（参赛）。
 * 证书上有昵称与编号，属于证明文件，因此不做匿名公开，
 * 不符合条件时说明原因而不是 404。
 */
export default async function TournamentCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, user, settings, disclaimer] = await Promise.all([
    getTournament(id),
    getCurrentUser(),
    getSettings(),
    certificateDisclaimer(),
  ]);
  if (!detail) notFound();

  const { item, myEntry } = detail;
  const brand = settings.siteName || '云轨社区';

  const isHost = Boolean(user && item.hostUserId && item.hostUserId === user.id);
  const isEntry = myEntry?.status === 'approved';
  const roles: CertRole[] = [
    ...(isHost ? (['host'] as CertRole[]) : []),
    ...(isEntry ? (['entry'] as CertRole[]) : []),
  ];

  const crumb = (
    <div className="crumb no-print">
      <Link href="/tournaments">赛事</Link>
      <span style={{ margin: '0 7px' }}>/</span>
      <Link href={`/tournaments/${item.id}`}>{item.title}</Link>
      <span style={{ margin: '0 7px' }}>/</span>
      <span>证书</span>
    </div>
  );

  if (roles.length === 0) {
    return (
      <div className="col-main">
        {crumb}
        <div className="card card-pad">
          <h1 className="page-title" style={{ fontSize: 20 }}>
            暂时没有可领取的证书
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            {user
              ? '赛事证书发给两类人：这场赛事的主办账号，以及报名审核通过的参赛队伍。'
              : '赛事证书只发给主办账号与审核通过的参赛者，请先登录。'}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            {!user && (
              <Link href="/login" className="btn btn-primary btn-sm">
                去登录
              </Link>
            )}
            <Link href={`/tournaments/${item.id}`} className="btn btn-ghost btn-sm">
              回到赛事详情
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-main">
      {crumb}
      <TournamentCertificate
        tournament={item}
        holder={user!.nickname}
        teamName={myEntry?.teamName}
        roles={roles}
        brand={brand}
        disclaimer={disclaimer}
      />
    </div>
  );
}
