import Link from 'next/link';
import { CHANGELOG } from '@/lib/changelog';

export const metadata = {
  title: '更新日志',
};

export default function ChangelogPage() {
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
            这里记录每次上线的功能与修复，最新的在最前面。共 {CHANGELOG.length} 个版本。
          </p>
        </div>

        {CHANGELOG.map((e) => (
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
