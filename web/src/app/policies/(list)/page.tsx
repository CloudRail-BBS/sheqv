import Link from 'next/link';
import { listPolicies } from '@/lib/policy-store';
import { buildMetadata } from '@/lib/seo';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildMetadata({
    title: '政策与协议',
    description: '用户协议、免责声明、隐私政策等站内政策。',
    path: '/policies',
  });
}

export default async function PoliciesPage() {
  const [items, settings] = await Promise.all([listPolicies(), getSettings()]);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">政策与协议</h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {settings.policiesHint || '使用本站服务前请阅读。政策由站点管理员维护，更新后立即生效。'}
            </p>
          </div>
          <span className="badge mono">{items.length} 份</span>
        </div>

        {items.length === 0 ? (
          <div className="card card-pad">
            <p className="small muted">站点还没有发布政策。</p>
          </div>
        ) : (
          <div className="policy-list">
            {items.map((p) => (
              <Link key={p.slug} href={`/policies/${p.slug}`} className="card policy-item">
                <div className="between">
                  <h2>{p.title}</h2>
                  <span className="badge mono">{p.version}</span>
                </div>
                <p>{p.summary || '查看完整内容'}</p>
                <div className="policy-meta">
                  更新于 {p.updatedAt}
                  <span>阅读全文 →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <aside className="rail">
        <div className="card rail-card">
          <div className="rail-title">说明</div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            政策用于说明服务规则、责任边界与数据处理方式，不替代《社区公约》的签署门槛。
            公约签名与证书在「公约」页查看。
          </p>
          <Link href="/agreements" className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}>
            查看公约与签署
          </Link>
        </div>
      </aside>
    </div>
  );
}
