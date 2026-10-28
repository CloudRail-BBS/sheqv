import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { listPublicGroups } from '@/lib/groups';
import { GroupTag } from '@/components/group-tag';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '身份组',
    description: '云轨社区的身份组：默认成员、管理员与自定义组，各自的权限、成员数与进组条件。',
    path: '/groups',
  });
}

export default async function GroupsPage() {
  const [groups, user] = await Promise.all([listPublicGroups(), getCurrentUser()]);
  const mineId = user?.group?.id;
  const total = groups.reduce((n, g) => n + g.memberCount, 0);

  return (
    <div className="cols">
      <div className="col-main">
        <h1 className="page-title">身份组</h1>
        <p className="small muted" style={{ marginTop: 4, lineHeight: 1.8 }}>
          身份组决定你能做什么：发帖、评论、审核、管理站点。组名与颜色会显示在作者名旁边，
          方便一眼看出对方是谁。身份组由管理员分配，不能自己申请。
        </p>

        {groups.length === 0 ? (
          <div className="card card-pad" style={{ marginTop: 14 }}>
            <p className="small muted">还没有可展示的身份组。</p>
          </div>
        ) : (
          <div className="group-grid">
            {groups.map((g) => {
              const accent = g.color || 'var(--blue)';
              return (
                <article
                  key={g.id}
                  className="card group-card"
                  data-mine={g.id === mineId}
                  style={{ '--gc': accent } as CSSProperties}
                >
                  <div className="gc-head">
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: accent,
                        flex: 'none',
                      }}
                      aria-hidden="true"
                    />
                    <span className="gc-name">{g.name}</span>
                    {g.isDefault && <span className="badge badge-ghost">默认</span>}
                    {g.id === mineId && <span className="badge badge-live">我的</span>}
                    <span className="mono small muted" style={{ marginLeft: 'auto' }}>
                      {g.memberCount} 人
                    </span>
                  </div>

                  <p className="gc-desc">{g.description || '这个身份组还没有写说明。'}</p>

                  {g.capabilities.length > 0 ? (
                    <div className="gc-caps">
                      {g.capabilities.map((c) => (
                        <span key={c} className="badge badge-ghost">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="gc-sign" style={{ marginTop: 10 }}>
                      只读权限：可以浏览社区内容。
                    </p>
                  )}

                  {g.requiredAgreements.length > 0 && (
                    <p className="gc-sign">进组需签署：{g.requiredAgreements.join('、')}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">你的身份组</div>
          {user ? (
            user.group ? (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <GroupTag group={user.group} />
                  <span className="small muted" style={{ marginLeft: 'auto' }}>
                    <Link href="/me" style={{ color: 'var(--blue)' }}>
                      详情 →
                    </Link>
                  </span>
                </div>
                <p className="small muted" style={{ marginTop: 10, lineHeight: 1.75 }}>
                  发帖、评论等权限由身份组决定；颜色会显示在你的帖子与评论旁边。
                </p>
              </>
            ) : (
              <p className="small muted" style={{ lineHeight: 1.75 }}>
                你的账号还没分配身份组，当前只能浏览。请联系管理员。
              </p>
            )
          ) : (
            <>
              <p className="small muted" style={{ lineHeight: 1.75 }}>
                登录后可以看到自己的身份组。
              </p>
              <Link href="/login" className="btn btn-sm btn-primary" style={{ marginTop: 10 }}>
                去登录
              </Link>
            </>
          )}
        </div>

        <div className="card rail-card">
          <div className="rail-title">怎么获得</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            注册后自动进入「默认」组；其他身份组由管理员在后台分配。
            部分组要求先签署公约，未签署时不能获得该组的权限。
          </p>
          <div className="row" style={{ gap: 14, marginTop: 12 }}>
            <span className="small muted">
              身份组 <b className="mono" style={{ color: 'var(--text)' }}>{groups.length}</b>
            </span>
            <span className="small muted">
              覆盖成员 <b className="mono" style={{ color: 'var(--text)' }}>{total}</b>
            </span>
          </div>
          <Link href="/agreements" className="btn btn-sm btn-ghost" style={{ marginTop: 12 }}>
            查看社区公约
          </Link>
        </div>
      </aside>
    </div>
  );
}
