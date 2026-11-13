'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * 找回密码：邮箱收验证码 → 设新密码。
 *
 * 两步共用一张卡片：第一步只填邮箱，发码成功后原地展开第二步（验证码 + 新密码），
 * 免得把人甩到另一个页面再找回来。服务端不区分「邮箱是否存在」，
 * 所以这里也不要去猜，统一提示「如果已注册，验证码已发送」。
 */
export function ResetForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 重发倒计时：和登录页的验证码按钮一致
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T | null; message?: string }> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as (T & { message?: string }) | null;
    return {
      ok: Boolean(res?.ok),
      data,
      message: data?.message,
    };
  }

  async function sendCode() {
    setErr(null);
    setNotice(null);
    if (!email.trim()) {
      setErr('请先填邮箱');
      return;
    }
    setSending(true);
    const r = await post<{ retryAfter?: number }>('/api/v1/auth/password/forgot', {
      email: email.trim(),
    });
    setSending(false);
    if (!r.ok) {
      setErr(r.message ?? '发送失败，请稍后再试');
      return;
    }
    setStep(2);
    setNotice(r.message ?? '验证码已发送，10 分钟内有效');
    setCountdown(Number(r.data?.retryAfter ?? 60));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (code.length !== 6) {
      setErr('验证码为 6 位数字');
      return;
    }
    if (password !== confirm) {
      setErr('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    const r = await post<{ ok?: boolean }>('/api/v1/auth/password/reset', {
      email: email.trim(),
      code,
      password,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message ?? '重置失败，请重新获取验证码');
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/login?reset=1'), 1200);
  }

  if (done) {
    return (
      <div className="auth-done">
        <p className="auth-done-title">密码已重置</p>
        <p className="small muted">正在返回登录页，用新密码登录即可。</p>
        <Link href="/login" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 14 }}>
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field" style={{ marginTop: 14 }}>
        <span>注册邮箱</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="账号绑定的邮箱"
          readOnly={step === 2}
          required
        />
      </label>

      {step === 1 ? (
        <button
          type="button"
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: 16 }}
          disabled={sending}
          onClick={() => void sendCode()}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6.5 12 13l9-6.5M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
          </svg>
          {sending ? '发送中…' : '发送验证码'}
        </button>
      ) : (
        <>
          <label className="field">
            <span>验证码</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 位数字"
                required
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void sendCode()}
                disabled={sending || countdown > 0}
                style={{ whiteSpace: 'nowrap' }}
              >
                {sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
              </button>
            </div>
          </label>

          <label className="field">
            <span>新密码</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="8–64 位，字母与数字都要有"
              required
            />
          </label>

          <label className="field">
            <span>确认新密码</span>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={busy}
            style={{ width: '100%', marginTop: 16 }}
          >
            {busy ? '提交中…' : '重置密码'}
          </button>
        </>
      )}

      {notice && !err && (
        <p className="small auth-note" style={{ marginTop: 10 }}>
          {notice}
        </p>
      )}
      {err && (
        <p className="small auth-err" style={{ marginTop: 10 }}>
          {err}
        </p>
      )}
    </form>
  );
}
