'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  title: string;
  version: string;
  scope: string;
  summary: string;
  gate: string;
  signed: boolean;
  signedAt: string | null;
  stale: boolean;
  /** 当前登录用户的昵称；null 表示未登录 */
  viewer: string | null;
}

export function SignAgreement(props: Props) {
  const { id, title, version, scope, summary, gate, signed, signedAt, stale, viewer } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!agree) {
      setError('请先勾选「我已阅读并同意」');
      return;
    }
    if (!viewer) {
      setError('请先登录再签署');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/agreements/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('sign_failed');
      setOpen(false);
      setAgree(false);
      router.refresh();
    } catch {
      setError('签署失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ag-foot">
        {signed ? (
          <div className="ag-signed">
            <span className="stamp">已签署</span>
            <span className="small muted">
              {version} · {signedAt}
            </span>
            <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setOpen(true)}>
              查看凭证
            </button>
          </div>
        ) : (
          <>
            <div className="small muted" style={{ lineHeight: 1.6 }}>
              {stale ? '公约已更新，需重新签署。' : gate}
            </div>
            {viewer ? (
              <button className="btn btn-primary" onClick={() => setOpen(true)}>
                {stale ? '重新签署' : `签署《${title}》`}
              </button>
            ) : (
              <Link href="/login" className="btn btn-primary">
                登录后签署
              </Link>
            )}
          </>
        )}
      </div>

      {open && (
        <div className="modal-mask" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ fontSize: 16 }}>{signed ? '签署凭证' : `签署《${title}》`}</h3>
            <p className="small dim" style={{ marginTop: 8, lineHeight: 1.7 }}>
              {signed ? (
                <>
                  你在 <b>{signedAt}</b> 签署了《{title}》{version}。签署记录与账号绑定，
                  公约升版后需要重新签署。
                </>
              ) : (
                <>
                  {summary}
                  <br />
                  <span className="muted">适用范围：{scope}</span>
                </>
              )}
            </p>

            {!signed && (
              <>
                <div className="hint-box" style={{ marginTop: 12 }}>
                  签署后生效，版本升版时自动失效并要求重签。未成年人需在监护人同意下使用本社区。
                </div>

                <div className="field" style={{ marginTop: 14 }}>
                  <span>签署人（当前账号）</span>
                  <div className="input" style={{ opacity: 0.8, display: 'flex', alignItems: 'center' }}>
                    {viewer ?? '未登录'}
                  </div>
                </div>

                <label className="check" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>我已阅读并同意《{title}》{version} 的全部条款</span>
                </label>

                {error && (
                  <div className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>
                    {error}
                  </div>
                )}
              </>
            )}

            <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                {signed ? '关闭' : '取消'}
              </button>
              {!signed && viewer && (
                <button className="btn btn-primary" onClick={submit} disabled={busy}>
                  {busy ? '签署中…' : '确认签署'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
