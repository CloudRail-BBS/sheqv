import Link from 'next/link';
import { getAbout } from '@/lib/about';
import { getSettings } from '@/lib/settings';
import { initialOf } from '@/lib/initials';

export const dynamic = 'force-dynamic';

/** 介绍正文按空行分段，避免后台一长串挤成一块 */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default async function AboutPage() {
  const [about, settings] = await Promise.all([getAbout(), getSettings()]);
  const intro = paragraphs(about.intro);
  const join = paragraphs(about.join);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="about-hero card card-pad">
          <span className="about-kicker">关于</span>
          <h1 className="page-title">{settings.siteName}</h1>
          <p className="about-lead">
            玩家社区与赛事确权平台：公会、战队、约战、资源与开发团队都在这里。
          </p>

          {intro.length > 0 ? (
            <div className="about-text">
              {intro.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="about-text muted">
              还没有填写站点介绍。管理员可以在「控制台 → 关于社区」里补上。
            </p>
          )}
        </div>

        {about.people.length > 0 && (
          <section className="about-section">
            <div className="section-h">
              <h2>社区成员</h2>
              <span className="hint">{about.people.length} 位</span>
            </div>
            <div className="about-people">
              {about.people.map((p) => (
                <article key={p.id} className="card about-person">
                  <span className="about-avatar">
                    {p.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar} alt="" loading="lazy" decoding="async" />
                    ) : (
                      initialOf(p.name)
                    )}
                  </span>
                  <div className="about-person-main">
                    <b>{p.name}</b>
                    {p.role && <span className="about-role">{p.role}</span>}
                    {p.bio && <p>{p.bio}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {about.partners.length > 0 && (
          <section className="about-section">
            <div className="section-h">
              <h2>合作单位</h2>
              <span className="hint">{about.partners.length} 家</span>
            </div>
            <div className="about-partners">
              {about.partners.map((p) => {
                const inner = (
                  <>
                    <span className="about-logo">
                      {p.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar} alt="" loading="lazy" decoding="async" />
                      ) : (
                        initialOf(p.name)
                      )}
                    </span>
                    <span className="about-partner-main">
                      <b>{p.name}</b>
                      {p.role && <span>{p.role}</span>}
                    </span>
                  </>
                );
                return p.url ? (
                  <a
                    key={p.id}
                    className="card about-partner"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={p.id} className="card about-partner">
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">加入我们</div>
          {join.length > 0 ? (
            <div className="about-text small">
              {join.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="small muted" style={{ lineHeight: 1.8 }}>
              注册后即可发帖、上传资源、创建公会与战队。发第一个资源会自动获得开发者身份。
            </p>
          )}
          <Link href="/register" className="btn btn-primary" style={{ marginTop: 12, width: '100%' }}>
            注册加入
          </Link>
          <Link href="/agreements" className="btn btn-ghost" style={{ marginTop: 6, width: '100%' }}>
            先看社区公约
          </Link>
        </div>

        <div className="card rail-card">
          <div className="rail-title">从这里开始</div>
          <div className="rail-list">
            <Link href="/resources" className="rail-item">
              资源库
            </Link>
            <Link href="/guilds" className="rail-item">
              公会
            </Link>
            <Link href="/teams" className="rail-item">
              战队
            </Link>
            <Link href="/leaderboard" className="rail-item">
              排行榜
            </Link>
            <Link href="/policies" className="rail-item">
              政策与协议
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
