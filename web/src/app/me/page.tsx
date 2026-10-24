import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { getCurrentUser } from '@/lib/current-user';
import { listPosts } from '@/lib/forum-store';
import { listActive } from '@/lib/agreement-store';
import { getSignatures } from '@/lib/agreement-state';
import { LogoutButton } from '@/components/logout-button';
import { TitleEditor } from '@/components/title-editor';
import { UserBadge } from '@/components/user-badge';
import { GroupTag } from '@/components/group-tag';
import { ProfileBgEditor } from '@/components/profile-bg-editor';
import { badgeOf } from '@/lib/badges';
import { listPublicGroups } from '@/lib/groups';
import { listOrgs } from '@/lib/orgs';
import { listMyDevTeams } from '@/lib/dev-team-store';
import { getSettings } from '@/lib/settings';
import { getAchievementState } from '@/lib/achievements';
import { AchievementChips } from '@/components/achievement-chips';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({ title: '我的', path: '/me', noIndex: true });
}

const DEFAULT_GUEST_TEXT =
  '「我的」需要账号登录后才能查看。本站没有默认账号，第一个注册的用户会成为管理员。';

export default async function MePage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);

  if (!user) {
    return (
      <div className="cols">
        <div className="col-main">
          <div className="card card-pad" style={{ maxWidth: 460, marginTop: 8 }}>
            <h1 className="page-title" style={{ fontSize: 19 }}>
              还没有登录
            </h1>
            <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {settings.meGuestText || DEFAULT_GUEST_TEXT}
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
        </div>
      </div>
    );
  }

  const [posts, agreements, achieved, groups, allGuilds, allTeams, myDevTeams] = await Promise.all([
    listPosts(),
    listActive(),
    getAchievementState(user),
    listPublicGroups(),
    listOrgs('guild'),
    listOrgs('team'),
    listMyDevTeams(),
  ]);
  const myGroup = groups.find((g) => g.id === user.group?.id);
  const myGuilds = allGuilds.filter((g) => g.ownerId === user.id);
  const myTeams = allTeams.filter((t) => t.ownerId === user.id);
  const hasOrg = myGuilds.length + myTeams.length + myDevTeams.length > 0;
  const sigs = await getSignatures(agreements);
  const mine = posts.filter((p) => p.author === user.nickname);
  const likes = mine.reduce((n, p) => n + p.likes, 0);
  const signedCount = agreements.filter((a) => sigs[a.id]?.signed).length;
  const joined = new Date(user.createdAt).toISOString().slice(0, 10);

  return (
    <div className="cols">
      <div className="col-main">
        <div
          className="card me-card"
          data-bg={Boolean(user.profileBg)}
          style={
            user.profileBg
              ? {
                  backgroundImage: `linear-gradient(90deg, var(--panel) 12%, color-mix(in srgb, var(--panel) 78%, transparent) 52%, transparent), url(${JSON.stringify(user.profileBg)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          <div className="me-ava">{user.nickname.slice(0, 1)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 7 }}>
              <span className="me-name">{user.nickname}</span>
              <UserBadge badge={badgeOf(user)} />
              <GroupTag group={user.group} />
              {user.developer && <span className="dev-chip">开发者</span>}
            </div>
            <div className="me-sub">
              @{user.username} · 注册于 {joined}
            </div>
          </div>
          <div className="row" style={{ marginLeft: 'auto', gap: 6 }}>
            {user.isAdmin && (
              <Link href="/admin" className="btn btn-sm btn-ghost">
                管理后台
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 13 }}>身份组</h3>
            <span className="small muted">由管理员分配</span>
          </div>
          {user.group ? (
            <>
              <div className="row wrap" style={{ gap: 8 }}>
                <GroupTag group={user.group} />
                {myGroup?.isDefault && <span className="badge badge-ghost">默认身份组</span>}
                <span className="small muted">
                  共 {myGroup?.memberCount ?? 0} 人
                </span>
              </div>
              <p className="small muted" style={{ marginTop: 8, lineHeight: 1.75 }}>
                {myGroup?.description || '这个身份组还没有写说明。'}
              </p>
              {myGroup && myGroup.capabilities.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  {myGroup.capabilities.map((c) => (
                    <span key={c} className="badge badge-ghost">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {myGroup && myGroup.requiredAgreements.length > 0 && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  进组需签署：{myGroup.requiredAgreements.join('、')}
                </p>
              )}
              <p className="small muted" style={{ marginTop: 10 }}>
                <Link href="/groups" style={{ color: 'var(--blue)' }}>
                  查看全部身份组 →
                </Link>
              </p>
            </>
          ) : (
            <p className="small muted" style={{ lineHeight: 1.75 }}>
              还没有分配身份组，当前按最小权限处理（不能发帖与评论）。请联系管理员。
            </p>
          )}
        </div>

        {hasOrg && (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="between" style={{ marginBottom: 8 }}>
              <h3 style={{ fontSize: 13 }}>我的组织</h3>
              <span className="small muted">三种身份互不影响</span>
            </div>
            <div className="org-links">
              {myGuilds.map((g) => (
                <Link key={g.id} href={`/guilds/${g.id}`} className="org-link">
                  <span className="badge badge-ghost">公会</span>
                  {g.name}
                </Link>
              ))}
              {myTeams.map((t) => (
                <Link key={t.id} href={`/teams/${t.id}`} className="org-link">
                  <span className="badge badge-ghost">战队</span>
                  {t.name}
                </Link>
              ))}
              {myDevTeams.map((t) => (
                <Link key={t.id} href={`/dev-teams/${t.id}`} className="org-link">
                  <span className="badge badge-ghost">开发团队</span>
                  {t.name}
                </Link>
              ))}
            </div>
            {myDevTeams.length > 0 && (
              <p className="small muted" style={{ marginTop: 8 }}>
                开发团队的作品会计入团队榜，个人榜只算你署名的资源。
              </p>
            )}
          </div>
        )}

        <ProfileBgEditor current={user.profileBg} />

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 13 }}>头衔</h3>
            <span className="small muted">显示在帖子与评论的作者名后面</span>
          </div>
          <TitleEditor current={user.title ?? ''} isAdmin={user.isAdmin} />
        </div>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 13 }}>徽章</h3>
            <span className="small muted">
              已获得 {achieved.earned.length} / {achieved.all.length}
            </span>
          </div>
          {achieved.earned.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <AchievementChips badges={achieved.earned} />
            </div>
          )}
          <div className="bz-grid">
            {achieved.all.map((b) => (
              <div key={b.id} className="bz-item" data-earned={b.earned}>
                <span className="bz" data-tone={b.tone}>
                  {b.name}
                </span>
                <span className="small muted">{b.desc}</span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            徽章由行为自动判定（发帖、评论、获赞、注册时长等），不需要申请。
          </p>
        </div>

        <div className="me-stats">
          {[
            { k: '我的帖子', v: String(mine.length) },
            { k: '获得点赞', v: String(likes) },
            { k: '已签公约', v: `${signedCount}/${agreements.length}` },
            { k: '身份组', v: user.group?.name ?? '未分组' },
          ].map((s) => (
            <div key={s.k} className="card">
              <b>{s.v}</b>
              <span>{s.k}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 13 }}>我的帖子</h3>
            <Link href="/" className="small" style={{ color: 'var(--blue)' }}>
              回社区 →
            </Link>
          </div>

          {mine.length === 0 ? (
            <p className="small muted" style={{ padding: '18px 16px' }}>
              还没有发过帖子。<Link href="/" style={{ color: 'var(--blue)' }}>去社区发一条</Link>
            </p>
          ) : (
            mine.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                className="rail-item"
                style={{ padding: '12px 16px', borderTop: '1px solid var(--line-soft)' }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title ?? p.body.slice(0, 26)}
                </span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)', flex: 'none' }}>
                  {p.likes} 赞 · {p.comments} 评
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">公约签署</div>
          <div className="rail-list">
            {agreements.map((a) => {
              const sig = sigs[a.id];
              return (
                <div key={a.id} className="rail-item">
                  <span>{a.title}</span>
                  <span className="mono" style={{ marginLeft: 8, color: 'var(--muted)' }}>
                    {a.version}
                  </span>
                  <span className={'badge ' + (sig.signed ? 'badge-live' : 'badge-warn')} style={{ marginLeft: 'auto' }}>
                    {sig.signed ? '已签' : sig.stale ? '需重签' : '未签'}
                  </span>
                </div>
              );
            })}
          </div>
          <Link href="/agreements" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }}>
            {signedCount === agreements.length ? '查看签署凭证' : '去签署公约'}
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">账号</div>
          <div className="rail-list">
            <div className="rail-item">
              <span>用户名</span>
              <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                {user.username}
              </span>
            </div>
            {user.email && (
              <div className="rail-item">
                <span>邮箱</span>
                <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                  {user.email}
                </span>
              </div>
            )}
            <div className="rail-item">
              <span>角色</span>
              <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                {user.role}
              </span>
            </div>
            <div className="rail-item">
              <span>密码</span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>scrypt 哈希</span>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            忘记密码请联系管理员重置。
          </p>
        </div>
      </aside>
    </div>
  );
}
