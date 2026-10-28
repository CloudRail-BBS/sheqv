import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { getSettings } from '@/lib/settings';
import { getSignatures } from '@/lib/agreement-state';
import { formatSignedAt } from '@/lib/agreements';
import { listActive } from '@/lib/agreement-store';
import { certificateDisclaimer } from '@/lib/policy-store';
import { AgreementCertificate } from '@/components/agreement-certificate';

export async function generateMetadata() {
  return { title: '公约签署证书', robots: { index: false, follow: false } };
}

export default async function AgreementCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, agreements, settings, disclaimer] = await Promise.all([
    getCurrentUser(),
    listActive(),
    getSettings(),
    certificateDisclaimer(),
  ]);

  const agreement = agreements.find((a) => a.id === id);
  if (!agreement) notFound();

  if (!user) {
    return (
      <div className="col-main">
        <div className="card card-pad">
          <h1 className="page-title" style={{ fontSize: 20 }}>
            登录后查看签署证书
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            公约证书与账号绑定，请先登录。
          </p>
          <Link href="/login" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const sigs = await getSignatures(agreements);
  const sig = sigs[agreement.id];
  if (!sig?.signed) {
    return (
      <div className="col-main">
        <div className="crumb">
          <Link href="/agreements">公约与签署</Link>
          <span style={{ margin: '0 7px' }}>/</span>
          <span>签署证书</span>
        </div>
        <div className="card card-pad">
          <h1 className="page-title" style={{ fontSize: 20 }}>
            还没有可用的签署证书
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            {sig?.stale
              ? '公约已升版，旧签名已失效；重新签署后会生成对应新版本的证书。'
              : `签署《${agreement.title}》后即可下载证书。`}
          </p>
          <Link href="/agreements" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            去签署
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="col-main">
      <div className="crumb no-print">
        <Link href="/agreements">公约与签署</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <Link href="/agreements">{agreement.title}</Link>
        <span style={{ margin: '0 7px' }}>/</span>
        <span>签署证书</span>
      </div>

      <AgreementCertificate
        agreement={{
          id: agreement.id,
          title: agreement.title,
          version: agreement.version,
          scope: agreement.scope,
        }}
        nickname={user.nickname}
        signedAt={sig.at ? formatSignedAt(sig.at) : agreement.updatedAt}
        brand={settings.siteName || '云轨社区'}
        disclaimer={disclaimer}
      />
    </div>
  );
}
