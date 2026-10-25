import { getSignatures } from '@/lib/agreement-state';
import { formatSignedAt } from '@/lib/agreements';
import { listActive } from '@/lib/agreement-store';
import { SignAgreement } from '@/components/sign-agreement';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  const user = await getCurrentUser();
  const agreements = await listActive();
  const sigs = await getSignatures(agreements);
  const signedCount = Object.values(sigs).filter((s) => s.signed).length;

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">公约与签署</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              签了才算数。约战讲诚信，发言讲分寸——两份公约分别约束两件事。
            </p>
          </div>
          <span
            className={'badge ' + (signedCount === agreements.length ? 'badge-live' : 'badge-warn')}
            data-signed={signedCount}
            data-total={agreements.length}
          >
            已签署 {signedCount} / {agreements.length}
          </span>
        </div>

        <div className="card card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="ring" aria-hidden="true" style={{ "--p": Math.round((signedCount / agreements.length) * 100) } as React.CSSProperties}>
            <b>{Math.round((signedCount / agreements.length) * 100)}%</b>
            <span>完成度</span>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small" style={{ fontWeight: 550 }}>
              {signedCount === agreements.length ? '两份公约都已签署' : '还有公约未签署'}
            </div>
            <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
              未签署《诚信公约》时无法发起约战、提交比分与确认结果；未签署《社区公约》时无法发帖、评论与上传资源。
              公约升版后旧签名自动失效，需要重新签署。
            </p>
          </div>
        </div>

        {agreements.map((a) => {
          const sig = sigs[a.id];
          return (
            <article key={a.id} className="card ag-card">
              <header className="ag-head">
                <div className="ag-no">{a.id === 'trust' ? '01' : '02'}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <h2 style={{ fontSize: 16 }}>{a.title}</h2>
                    <span className="badge mono">{a.version}</span>
                    {sig.signed ? (
                      <span className="badge badge-live">已签署</span>
                    ) : sig.stale ? (
                      <span className="badge badge-warn">版本已更新</span>
                    ) : (
                      <span className="badge">未签署</span>
                    )}
                  </div>
                  <div className="small muted" style={{ marginTop: 3 }}>
                    更新于 {a.updatedAt} · 适用于{a.scope}
                  </div>
                </div>
              </header>

              <p className="ag-summary">{a.summary}</p>

              <ol className="ag-clauses">
                {a.clauses.map((c) => (
                  <li key={c.h}>
                    <b>{c.h}</b>
                    <span>{c.p}</span>
                  </li>
                ))}
              </ol>

              <SignAgreement
                id={a.id}
                title={a.title}
                version={a.version}
                scope={a.scope}
                summary={a.summary}
                gate={a.gate}
                viewer={user?.nickname ?? null}
                signed={sig.signed}
                signedAt={sig.at ? formatSignedAt(sig.at) : null}
                stale={sig.stale}
              />
            </article>
          );
        })}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">签署状态</div>
          <div className="rail-list">
            {agreements.map((a) => {
              const sig = sigs[a.id];
              return (
                <div key={a.id} className="rail-item">
                  <span>{a.title}</span>
                  <span className={'badge ' + (sig.signed ? 'badge-live' : 'badge-warn')} style={{ marginLeft: 'auto' }}>
                    {sig.signed ? '已签' : '未签'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">签署规则</div>
          <div className="rule-list">
            <div className="rule-row">
              <span className="n">1</span>
              <span>签署与账号绑定，换设备不需要重签</span>
            </div>
            <div className="rule-row">
              <span className="n">2</span>
              <span>公约升版后旧签名失效，需重新签署</span>
            </div>
            <div className="rule-row">
              <span className="n">3</span>
              <span>签署记录可在「我的」查看，可导出</span>
            </div>
          </div>
        </div>

        <div className="card rail-card">
          <div className="rail-title">版本记录</div>
          <div className="rail-list">
            {agreements.map((a) => (
              <div key={a.id} className="rail-item">
                <span>{a.title}</span>
                <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                  {a.version} · {a.updatedAt}
                </span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            修改记录与生效日期公开可查，重大变更会同步公告。
          </p>
        </div>
      </aside>
    </div>
  );
}
