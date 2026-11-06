import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { listMySubmissions } from '@/lib/wiki';
import { categoryLabel, fmtDay, SUBMISSION_STATUS } from '@/lib/wiki-types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '我的百科投稿',
    description: '查看自己提交的百科词条与审核状态。',
    path: '/wiki/mine',
    noIndex: true,
  });
}

export default async function WikiMinePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/wiki/mine');
  const sp = await searchParams;
  const items = await listMySubmissions();

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">我的投稿</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              百科由社区共同编写：提交后进入审核，通过才会公开。
            </p>
          </div>
          <Link href="/wiki/submit" className="btn btn-primary btn-sm">
            投稿新词条
          </Link>
        </div>

        {sp.sent === '1' && (
          <div className="card card-pad wiki-sent">
            已提交，等管理员审核。通过后会出现在百科里，状态可以在本页查看。
          </div>
        )}

        {items.length === 0 ? (
          <div className="card card-pad muted small" style={{ marginTop: 12 }}>
            还没有投稿。发现百科里缺什么，可以直接补一条。
          </div>
        ) : (
          <div className="wiki-mine-list">
            {items.map((it) => {
              const st = SUBMISSION_STATUS[it.status];
              return (
                <article key={it.id} className="card card-pad wiki-mine-item">
                  <div className="wiki-mine-head">
                    <b>{it.title}</b>
                    <span className="badge" data-tone={st.tone}>
                      {st.label}
                    </span>
                  </div>
                  <div className="wiki-mine-meta">
                    <span>{categoryLabel(it.category)}</span>
                    <span>{fmtDay(it.createdAt)}</span>
                    <span>{it.entrySlug ? '修改已有词条' : '新词条'}</span>
                    {it.entrySlug && it.status === 'approved' && (
                      <Link href={`/wiki/${it.entrySlug}`}>查看词条 →</Link>
                    )}
                  </div>
                  {it.summary && <p className="wiki-mine-summary">{it.summary}</p>}
                  {it.note && (
                    <p className="wiki-mine-note" data-tone={st.tone}>
                      审核意见：{it.note}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
