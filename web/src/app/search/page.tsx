import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { listPosts } from '@/lib/forum-store';
import { MATCHES, RESOURCES, GAME_LABEL } from '@/lib/data';
import { listOrgs } from '@/lib/orgs';
import { formatBytes } from '@/lib/capabilities';

export async function generateMetadata() {
  return buildMetadata({ title: '搜索', path: '/search', noIndex: true });
}

const HOT = ['天空之城', '整合包', '名单快照', '星轨', '约战'];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const kw = q.trim().toLowerCase();
  const hit = (...fields: string[]) => !kw || fields.join(' ').toLowerCase().includes(kw);

  const posts = (await listPosts()).filter((p) => hit(p.title ?? '', p.body, p.tags.join(' ')));
  const resources = RESOURCES.filter((r) => hit(r.title, r.summary, r.tags.join(' '), r.author));
  // 公会与战队是独立实体，各自查各自的，不互相带出
  const [allGuilds, allTeams] = await Promise.all([listOrgs('guild'), listOrgs('team')]);
  const guilds = allGuilds.filter((g) => hit(g.name, g.intro, g.tag, g.owner));
  const teams = allTeams.filter((t) => hit(t.name, t.intro, t.tag, t.owner));
  const matches = MATCHES.filter((m) => hit(m.title, m.guildA.name, m.guildB.name, m.format));
  const total = posts.length + resources.length + guilds.length + teams.length + matches.length;

  return (
    <div className="cols">
      <div className="col-main">
        <div>
          <h1 className="page-title">搜索</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            {kw ? `“${q}” 共 ${total} 条结果` : '输入关键词，搜索帖子、资源、公会、战队与比赛'}
          </p>
        </div>

        <form action="/search" className="search" style={{ maxWidth: 'none', display: 'block', position: 'relative' }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', left: 12, top: 9, width: 15, height: 15, color: 'var(--muted)' }}>
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={q} placeholder="试试“天空之城”或“星轨”" style={{ paddingLeft: 34 }} />
        </form>

        {!kw && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small muted">热门：</span>
            {HOT.map((h) => (
              <Link key={h} href={`/search?q=${encodeURIComponent(h)}`} className="chip">{h}</Link>
            ))}
          </div>
        )}

        {posts.length > 0 && (
          <section>
            <div className="section-h"><h2>帖子</h2><span className="hint">{posts.length} 条</span></div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {posts.slice(0, 5).map((p) => (
                <Link key={p.id} href={p.href} className="rail-item" style={{ padding: '12px 16px' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title ?? p.body.slice(0, 26)}
                  </span>
                  <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{p.likes} 赞</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {resources.length > 0 && (
          <section>
            <div className="section-h"><h2>资源</h2><span className="hint">{resources.length} 条</span></div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {resources.map((r) => (
                <Link key={r.id} href={`/resources/${r.id}`} className="rail-item" style={{ padding: '12px 16px' }}>
                  <span className="badge badge-mc">{GAME_LABEL[r.game]}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{formatBytes(r.sizeBytes)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {guilds.length > 0 && (
          <section>
            <div className="section-h"><h2>公会</h2><span className="hint">{guilds.length} 个</span></div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {guilds.map((g) => (
                <Link key={g.id} href={`/guilds/${g.id}`} className="rail-item" style={{ padding: '12px 16px' }}>
                  <span className="crest a" style={{ width: 24, height: 24, fontSize: 9, borderRadius: 6 }}>{g.tag}</span>
                  <span>{g.name}</span>
                  <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{g.members} 人</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {teams.length > 0 && (
          <section>
            <div className="section-h"><h2>战队</h2><span className="hint">{teams.length} 支</span></div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {teams.map((t) => (
                <Link key={t.id} href={`/teams/${t.id}`} className="rail-item" style={{ padding: '12px 16px' }}>
                  <span className="crest a" style={{ width: 24, height: 24, fontSize: 8.5, borderRadius: 6 }}>{t.tag}</span>
                  <span>{t.name}</span>
                  <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{t.wins}-{t.losses}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {matches.length > 0 && (
          <section>
            <div className="section-h"><h2>比赛</h2><span className="hint">{matches.length} 场</span></div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {matches.map((m) => (
                <Link key={m.id} href={`/matches/${m.id}`} className="rail-item" style={{ padding: '12px 16px' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                  <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{m.guildA.score ?? '–'} : {m.guildB.score ?? '–'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {kw && total === 0 && (
          <div className="card card-pad">
            <p className="small dim">没有找到匹配内容。换个关键词，或到资源库按分类浏览。</p>
            <Link href="/resources" className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}>去资源库</Link>
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">搜索范围</div>
          <div className="rail-list">
            <div className="rail-item"><span>帖子</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{posts.length}</span></div>
            <div className="rail-item"><span>资源</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{resources.length}</span></div>
            <div className="rail-item"><span>公会</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{guilds.length}</span></div>
            <div className="rail-item"><span>战队</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{teams.length}</span></div>
            <div className="rail-item"><span>比赛</span><span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{matches.length}</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
