import Link from 'next/link';
import { CHANGELOG, type ChangelogEntry } from '@/lib/changelog';
import { listChangelog, type ChangelogApiItem } from '@/lib/changelog-store';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata() {
  return buildMetadata({
    title: '更新日志',
    description: '云轨社区的功能更新与修复记录。',
    path: '/changelog',
  });
}

/** 库里的条目 → 页面结构：正文按行拆成要点，标签统一用条目自身的 */
function toEntry(e: ChangelogApiItem): ChangelogEntry {
  const tag = (e.tag || '功能') as ChangelogEntry['items'][number]['tag'];
  return {
    version: e.version,
    title: e.title,
    date: new Date(e.releasedAt).toISOString().slice(0, 10),
    items: e.body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text) => ({ tag, text })),
  };
}

export default async function ChangelogPage() {
  const fromDb = await listChangelog();
  // 后台还没录时回落到代码里的内置记录，避免升级后页面变空
  const entries: ChangelogEntry[] = fromDb.length > 0 ? fromDb.map(toEntry) : CHANGELOG;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>更新日志</span>
        </div>

        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <h1 className="page-title" style={{ fontSize: 20 }}>
            更新日志
          </h1>
          <p className="small muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
            这里记录每次上线的功能与修复，最新的在最前面。共 {entries.length} 个版本。
          </p>
        </div>

        {entries.map((e) => (
          <section key={e.version} className="card card-pad cl-item">
            <div className="cl-head">
              <h2 className="cl-title">{e.title}</h2>
              <span className="cl-ver mono">{e.version}</span>
              <span className="cl-date mono">{e.date}</span>
            </div>

            <ul className="cl-list">
              {e.items.map((it, i) => (
                <li key={`${e.version}-${i}`} className="cl-row">
                  <span className="cl-tag" data-tag={it.tag}>
                    {it.tag}
                  </span>
                  <span>{it.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">版本号怎么读</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            形如 <code>2026.10.21.3</code>：年份.月份.日期.当天第几次发布。
            同一天多次上线时，末位递增。
          </p>
        </div>

        <div className="card rail-card">
          <div className="rail-title">想看细节</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            每个版本的提交记录都在代码仓库里，开发文档的「变更记录」章节有更技术的说明。
          </p>
        </div>
      </aside>
    </div>
  );
}
