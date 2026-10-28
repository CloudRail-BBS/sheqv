import Link from 'next/link';
import { latestRelease } from '@/lib/app-store';
import { APP_PLATFORMS, fmtBytes } from '@/lib/app-release-types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '客户端下载',
    description: '下载云轨社区 Windows、macOS 与 Android 客户端。',
    path: '/download',
  });
}

export default async function DownloadPage() {
  const releases = await Promise.all(
    APP_PLATFORMS.map(async (p) => ({ meta: p, release: await latestRelease(p.key) })),
  );
  const groups = ['Windows', 'macOS', 'Android'] as const;

  return (
    <div className="cols">
      <div className="col-main">
        <h1 className="page-title">客户端下载</h1>
        <p className="small muted" style={{ marginTop: 4 }}>
          桌面端与 Android 端都连接同一个社区；选择你的平台下载安装包。
        </p>

        {groups.map((group) => {
          const items = releases.filter((x) => x.meta.group === group);
          return (
            <section key={group} className="download-group">
              <h2>{group}</h2>
              <div className="download-grid">
                {items.map(({ meta, release }) => (
                  <article key={meta.key} className="card download-card">
                    <div className="download-head">
                      <b>{meta.label}</b>
                      {release && <span className="badge mono">{release.version} ({release.build})</span>}
                    </div>
                    <p className="small muted">{meta.hint}</p>
                    {release ? (
                      <>
                        <p className="small muted download-meta">
                          {fmtBytes(release.fileSize)} · {release.updatedAt}
                          {release.forceUpdate && <span className="badge badge-danger" style={{ marginLeft: 6 }}>强制更新</span>}
                        </p>
                        {release.notes && <p className="small download-notes">{release.notes}</p>}
                        <a href={release.downloadUrl} className="btn btn-primary btn-sm download-btn">
                          下载 {release.version}
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="small muted download-meta">暂未发布</p>
                        <button className="btn btn-sm btn-ghost download-btn" disabled>暂未发布</button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        <div className="card card-pad" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 13 }}>安装说明</h3>
          <p className="small muted" style={{ lineHeight: 1.8, marginTop: 6 }}>
            Windows 与 macOS 安装包当前为直接分发。未签名版本可能需要手动允许打开；
            Android 安装 APK 时需要允许“安装未知应用”。应用内会提示新版本与更新说明。
          </p>
        </div>
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">客户端能力</div>
          <div className="rule-list">
            <div className="rule-row"><span className="n">1</span><span>资源下载保存到本地</span></div>
            <div className="rule-row"><span className="n">2</span><span>评论、约战与审核通知</span></div>
            <div className="rule-row"><span className="n">3</span><span>系统分享与邀请</span></div>
            <div className="rule-row"><span className="n">4</span><span>应用内检查更新</span></div>
          </div>
          <Link href="/policies/privacy" className="btn btn-sm btn-ghost" style={{ marginTop: 10, width: '100%' }}>
            隐私政策
          </Link>
        </div>
      </aside>
    </div>
  );
}
