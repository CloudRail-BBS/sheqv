'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Geetest, type CaptchaPayload } from './geetest';

export interface ProviderFlags {
  github: boolean;
  cnkd: boolean;
}

interface CommonProps {
  /** 为空表示站点没开人机验证，表单直接不渲染这一块 */
  captchaId: string;
  providers: ProviderFlags;
  /** 服务端渲染好的站点标识，避免把设置整包（含密钥）传到浏览器 */
  logo: ReactNode;
  siteName: string;
  /** 后台可配的说明文案；为空时用内置默认 */
  hint?: string;
  initialError?: string | null;
  /** 后台是否开启「邮箱验证码登录」；关闭时界面上不出现切换入口 */
  emailEnabled?: boolean;
  /** 外层自带卡片与标题时用：不渲染 AuthHead，也不套 card 背景 */
  bare?: boolean;
}

const GITHUB_ICON = (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"
      fill="currentColor"
    />
  </svg>
);

const CNKD_ICON = (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      d="M12 3 5 6v5.2c0 4.2 2.9 7.6 7 8.8 4.1-1.2 7-4.6 7-8.8V6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="m9 12 2.2 2.2L15.5 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; message?: string; becameAdmin?: boolean; retryAfter?: number }
    | null;
  return { ok: res.ok, data };
}

/** 第三方登录入口：只在后台配了凭据时出现 */
function AuthSocials({ providers }: { providers: ProviderFlags }) {
  if (!providers.github && !providers.cnkd) return null;

  return (
    <div className="auth-socials">
      {providers.github && (
        <a className="auth-social" href="/api/v1/auth/oauth/github">
          {GITHUB_ICON}
          GitHub 登录
        </a>
      )}
      {providers.cnkd && (
        <a className="auth-social" href="/api/v1/auth/oauth/cnkd">
          {CNKD_ICON}
          CNKD 一证通行
        </a>
      )}
      <div className="auth-or">
        <span>或使用账号密码</span>
      </div>
    </div>
  );
}

function AuthHead({
  logo,
  siteName,
  title,
  desc,
}: {
  logo: ReactNode;
  siteName: string;
  title: string;
  desc: string;
}) {
  return (
    <>
      <div className="auth-brand">
        {logo}
        <div>
          <b>{siteName}</b>
          <span>玩家社区 · 赛事确权</span>
        </div>
      </div>
      <h1 className="page-title" style={{ fontSize: 20, marginTop: 14 }}>
        {title}
      </h1>
      <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
        {desc}
      </p>
    </>
  );
}

export function RegisterForm(props: CommonProps & { isFirst: boolean }) {
  const { captchaId, providers, logo, siteName, hint, initialError, isFirst } = props;
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [err, setErr] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  const needCaptcha = Boolean(captchaId);
  const ready = !needCaptcha || Boolean(captcha);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) {
      setErr('请先完成人机验证');
      return;
    }
    setBusy(true);
    setErr(null);

    const { ok, data } = await post('/api/v1/auth/register', {
      username,
      nickname,
      email,
      password,
      captcha,
    });

    setBusy(false);

    if (!ok) {
      setErr(data?.message ?? data?.error ?? '注册失败');
      setCaptcha(null);
      setResetKey((k) => k + 1);
      return;
    }

    router.replace('/me');
    router.refresh();
  }

  return (
    <form className="card card-pad auth-card" onSubmit={submit}>
      <AuthHead
        logo={logo}
        siteName={siteName}
        title="创建账号"
        desc={
          isFirst
            ? '你是第一个注册的账号，注册后将成为本站管理员。'
            : hint || '注册后即可发帖、评论与签署公约。'
        }
      />

      <AuthSocials providers={providers} />

      <label className="field" style={{ marginTop: 14 }}>
        <span>用户名（登录用）</span>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="3–20 位字母 / 数字 / _ / -"
          autoComplete="username"
          required
        />
      </label>

      <label className="field">
        <span>昵称（对外展示）</span>
        <input
          className="input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="2–16 字"
          maxLength={16}
          required
        />
      </label>

      <label className="field">
        <span>
          邮箱<em className="field-opt">可选，填了可用邮箱登录</em>
        </span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>

      <label className="field">
        <span>密码</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 位，含字母和数字"
          autoComplete="new-password"
          required
        />
      </label>

      {needCaptcha && (
        <div style={{ marginTop: 12 }}>
          <Geetest captchaId={captchaId} onChange={setCaptcha} resetKey={resetKey} />
        </div>
      )}

      {err && (
        <p className="small auth-err" style={{ marginTop: 10 }}>
          {err}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}>
        {busy ? '创建中…' : '注册并登录'}
      </button>

      <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
        已有账号？
        <Link href="/login" className="auth-link">
          直接登录
        </Link>
      </p>
    </form>
  );
}

export function LoginForm(props: CommonProps) {
  const { captchaId, providers, logo, siteName, hint, initialError, emailEnabled, bare } = props;
  const router = useRouter();

  const [mode, setMode] = useState<'password' | 'email'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);

  const [err, setErr] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needCaptcha = Boolean(captchaId);
  const ready = !needCaptcha || Boolean(captcha);

  // 重发倒计时：服务端返回的 retryAfter 是秒数，这里只负责往下减
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) {
      setErr('请先完成人机验证');
      return;
    }
    setBusy(true);
    setErr(null);
    setNotice(null);

    const { ok, data } = await post('/api/v1/auth/login', { username: identifier, password, captcha });

    setBusy(false);

    if (!ok) {
      setErr(data?.message ?? '用户名或密码不正确');
      setCaptcha(null);
      setResetKey((k) => k + 1);
      return;
    }

    router.replace('/me');
    router.refresh();
  }

  async function sendCode() {
    if (countdown > 0 || sending) return;
    if (!email.trim()) {
      setErr('请先填写邮箱');
      return;
    }
    setSending(true);
    setErr(null);
    setNotice(null);

    const { ok, data } = await post('/api/v1/auth/email-code', { email: email.trim() });

    setSending(false);

    if (!ok) {
      setErr(data?.message ?? '验证码发送失败，请稍后再试');
      return;
    }
    setNotice(data?.message ?? '验证码已发送，请查收邮件');
    setCountdown(typeof data?.retryAfter === 'number' ? data.retryAfter : 60);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setErr('请输入邮件里的 6 位验证码');
      return;
    }
    setBusy(true);
    setErr(null);

    const { ok, data } = await post('/api/v1/auth/email-login', {
      email: email.trim(),
      code: code.trim(),
    });

    setBusy(false);

    if (!ok) {
      setErr(data?.message ?? '验证码不正确或已过期');
      return;
    }

    router.replace('/me');
    router.refresh();
  }

  const tab = (key: 'password' | 'email', label: string) => (
    <button
      type="button"
      className={`btn ${mode === key ? 'btn-primary' : 'btn-ghost'}`}
      style={{ flex: 1 }}
      onClick={() => {
        setMode(key);
        setErr(null);
        setNotice(null);
      }}
    >
      {label}
    </button>
  );

  return (
    <form
      className={bare ? 'auth-form' : 'card card-pad auth-card'}
      onSubmit={mode === 'password' ? submitPassword : submitEmail}
    >
      {!bare && (
        <AuthHead
          logo={logo}
          siteName={siteName}
          title="登录"
          desc={hint || '登录后可发帖、评论、签署公约与进入后台。'}
        />
      )}

      {emailEnabled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {tab('password', '密码登录')}
          {tab('email', '邮箱验证码')}
        </div>
      )}

      <AuthSocials providers={providers} />

      {mode === 'password' ? (
        <>
          <label className="field" style={{ marginTop: 14 }}>
            <span>用户名或邮箱</span>
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span>密码</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {needCaptcha && (
            <div style={{ marginTop: 12 }}>
              <Geetest captchaId={captchaId} onChange={setCaptcha} resetKey={resetKey} />
            </div>
          )}
        </>
      ) : (
        <>
          <label className="field" style={{ marginTop: 14 }}>
            <span>邮箱</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="账号绑定的邮箱"
              required
            />
          </label>

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
                onClick={sendCode}
                disabled={sending || countdown > 0}
                style={{ whiteSpace: 'nowrap' }}
              >
                {sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
              </button>
            </div>
          </label>
        </>
      )}

      {err && (
        <p className="small auth-err" style={{ marginTop: 10 }}>
          {err}
        </p>
      )}

      {notice && (
        <p className="small muted" style={{ marginTop: 10 }}>
          {notice}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}>
        {busy ? (mode === 'password' ? '登录中…' : '验证中…') : '登录'}
      </button>

      <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
        还没有账号？
        <Link href="/register" className="auth-link">
          注册
        </Link>
      </p>
    </form>
  );
}
