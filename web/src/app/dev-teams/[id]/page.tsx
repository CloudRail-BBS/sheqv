import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { getDevTeam } from '@/lib/dev-team-store';
import { listTeamResources } from '@/lib/resource-store';
import { devTeamGameLabel } from '@/lib/dev-team-types';
import { ResourceCard } from '@/components/resource-card';
import { DevTeamOwner } from '@/components/dev-team-owner';
import { buildMetadata } from '@/lib/seo';
import { fmtNum } from '@/lib/resource-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getDevTeam(id);
  if (!team) return buildMetadata({ title: '开发团队', path: `/dev-teams/${id}`, noIndex: true });
  return buildMetadata({
    title: team.name,
    description: team.description || `${team.name} · 开发团队，${team.resourceCount} 个资源，${fmtNum(team.downloads)} 次下载。`,
    path: `/dev-teams/${id}`,
  });
}

export default async function DevTeamDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [team, user, resources] = await Promise.all([
    getDevTeam(id),
    getCurrentUser(),
    listTeamResources(id),
  ]);

  if (!team) notFound();

  const isOwner = Boolean(user && (user.id === team.ownerId || user.isAdmin));
  const accent = team.color || '#3e7cff';

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/dev-teams">开发团队</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>{team.name}</span>
        </div>

        <section
          className="card dev-team-hero"
          style={{ '--dt-color': accent } as CSSProperties}
        >
          <div className="dth-top">
            <span
              className="dth-mark"
              style={{
                background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                color: accent,
                borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
              }}
            >
              {team.tag}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="dth-name">{team.name}</h1>
              <div className="small muted">
                {devTeamGameLabel(team.game)} · 负责人 {team.owner} ·{' '}
                {new Date(team.createdAt).toISOString().slice(0, 10)} 成立
              </div>
            </div>
          </div>

          <p className="dth-desc">{team.description || '这个团队还没有写简介。'}</p>

          <div className="dth-stats">
            <span><b className="mono">{team.memberCount}</b> 成员</span>
            <span><b className="mono">{team.resourceCount}</b> 资源</span>
            <span><b className="mono">{fmtNum(team.downloads)}</b> 下载</span>
            <span><b className="mono">{fmtNum(team.likes)}</b> 点赞</span>
            <span><b className="mono">{fmtNum(team.resourceCount * 4 + team.downloads + team.likes * 3)}</b> 团队分</span>
          </div>
        </section>

        <div className="between" style={{ marginTop: 16, marginBottom: 10 }}>
          <h2 className="page-title" style={{ fontSize: 16 }}>团队作品</h2>
          <span className="small muted">{resources.length} 个</span>
        </div>

        {resources.length === 0 ? (
          <div className="card card-pad">
            <p className="small muted">
              团队还没有作品。成员在发布资源时选「以团队名义发布」，就会出现在这里。
            </p>
          </div>
        ) : (
          <div className="res-grid">
            {resources.map((r) => (
              <ResourceCard key={r.id} item={r} />
            ))}
          </div>
        )}

        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <h2 className="page-title" style={{ fontSize: 16 }}>成员</h2>
            <span className="small muted">最多 20 人</span>
          </div>
          <div className="dt-members">
            {(team.members ?? []).map((m) => (
              <div key={m.userId} className="dt-member">
                <span className="post-avatar" style={{ width: 30, height: 30, fontSize: 12, borderRadius: 9 }}>
                  {m.nickname.slice(0, 1)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="small" style={{ fontWeight: 550 }}>{m.nickname}</span>
                    {m.role === 'owner' ? (
                      <span className="badge badge-live">负责人</span>
                    ) : (
                      <span className="badge badge-ghost">成员</span>
                    )}
                  </div>
                  <span className="small muted mono">
                    {new Date(m.joinedAt).toISOString().slice(0, 10)} 加入
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="rail">
        {isOwner && <DevTeamOwner teamId={team.id} members={team.members ?? []} />}

        <div className="card rail-card">
          <div className="rail-title">怎么加入</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            负责人按昵称邀请，对方必须已经是开发者（发布过至少一个资源）。
            成员可以以团队名义发布资源，团队榜按作品下载与点赞计分。
          </p>
          <Link href="/resources/new" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            发布团队作品
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">团队分</div>
          <dl className="kv">
            <dt>资源数</dt>
            <dd className="mono">× 4</dd>
            <dt>下载量</dt>
            <dd className="mono">× 1</dd>
            <dt>点赞量</dt>
            <dd className="mono">× 3</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 8 }}>
            与开发者个人榜同一套口径。
          </p>
        </div>
      </aside>
    </div>
  );
}
