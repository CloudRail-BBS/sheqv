'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IdentityState } from '@/lib/me-identities';

/**
 * 「我的 → 登录方式」：给已有账号绑定 / 解绑第三方登录。
 *
 * - 绑定走 `GET /api/v1/auth/oauth/{provider}?bind=1`，整页跳到第三方再回来；
 * - 解绑走 `DELETE /api/v1/me/identities/{provider}`，成功后就地刷新；
 * - 后端会拦住「解绑最后一个登录方式」，错误信息直接显示在卡片里。
 */

const PROVIDERS = [
  { key: 'github', name: 'GitHub', hint: '用 GitHub 账号一键登录' },
  { key: 'cnkd', name: 'CNKD', hint: '用 CNKD 账号一键登录' },
] as const;

function Icon({ provider }: { provider: string }) {
  if (provider === 'github') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.88.5-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" strokeLinecap="round" />
    </svg>
  );
}

export function LoginMethods({
  state,
  notice,
}: {
  state: IdentityState;
  /** 从 /me?bind=... 带回来的结果 */
  notice?: { kind: 'ok' | 'err'; text: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const bound = new Map(state.items.map((i) => [i.provider, i]));

  async function unbind(provider: string, name: string) {
    if (!window.confirm(`解绑 ${name}？之后不能用它登录。`)) return;
    setBusy(provider);
    setErr(null);
    const res = await fetch(`/api/v1/me/identities/${provider}`, { method: 'DELETE' }).catch(
      () => null,
    );
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(null);
    if (!res?.ok) {
      setErr(data?.message ?? '解绑失败');
      return;
    }
    router.refresh();
  }

  return (
    <div className="card card-pad" style={{ marginTop: 12 }}>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 13 }}>登录方式</h3>
        <span className="small muted">绑定后可用第三方一键登录</span>
      </div>

      {(notice || err) && (
        <p
          className="small"
          style={{
            margin: '0 0 8px',
            color: notice?.kind === 'err' || err ? 'var(--danger)' : 'var(--blue)',
          }}
        >
          {err ?? notice?.text}
        </p>
      )}

      <div className="lm-list">
        <div className="lm-row">
          <span className="lm-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="4" y="10" width="16" height="10" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
          </span>
          <div className="lm-main">
            <b>用户名密码</b>
            <p>{state.hasPassword ? '已设置，可以账号密码登录' : '未设置密码，只能通过第三方登录'}</p>
          </div>
          <span className="lm-state" data-on={state.hasPassword}>
            {state.hasPassword ? '已设置' : '未设置'}
          </span>
        </div>

        {PROVIDERS.map((p) => {
          const item = bound.get(p.key);
          const enabled = state.providers[p.key as 'github' | 'cnkd'];
          return (
            <div className="lm-row" key={p.key}>
              <span className="lm-ico" aria-hidden="true">
                <Icon provider={p.key} />
              </span>
              <div className="lm-main">
                <b>{p.name}</b>
                <p>
                  {item
                    ? `已绑定 ${item.login}`
                    : enabled
                      ? p.hint
                      : '站点暂未开放这个平台'}
                </p>
              </div>
              {item ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => unbind(p.key, p.name)}
                  disabled={busy === p.key}
                >
                  {busy === p.key ? '解绑中…' : '解绑'}
                </button>
              ) : enabled ? (
                <a className="btn btn-sm" href={`/api/v1/auth/oauth/${p.key}?bind=1`}>
                  绑定
                </a>
              ) : (
                <span className="lm-state">未开放</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
