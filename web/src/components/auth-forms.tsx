'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Geetest, type CaptchaPayload } from './geetest';

interface CommonProps {
  /** 为空表示未配置 GeeTest，表单不渲染验证码 */
  captchaId: string;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; message?: string; becameAdmin?: boolean }
    | null;
  return { ok: res.ok, data };
}

function CaptchaNotice({ captchaId }: { captchaId: string }) {
  if (captchaId) return null;
  return (
    <div className="hint-box" style={{ fontSize: 12 }}>
      未配置人机验证（<code className="mono">GEETEST_ID</code> / <code className="mono">GEETEST_KEY</code>），
      当前部署会跳过校验。公网部署请务必配置。
    </div>
  );
}

export function RegisterForm({ captchaId, isFirst }: CommonProps & { isFirst: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
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
      <h1 className="page-title" style={{ fontSize: 20 }}>
        创建账号
      </h1>
      <p className="small muted" style={{ marginTop: 4, lineHeight: 1.7 }}>
        {isFirst
          ? '你是第一个注册的账号，注册后将成为本站管理员。'
          : '注册后即可发帖、评论与签署公约。'}
      </p>

      <label className="field" style={{ marginTop: 16 }}>
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

      <div style={{ marginTop: 12 }}>
        <CaptchaNotice captchaId={captchaId} />
        {needCaptcha && <Geetest captchaId={captchaId} onChange={setCaptcha} resetKey={resetKey} />}
      </div>

      {err && (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>
          {err}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}>
        {busy ? '创建中…' : '注册并登录'}
      </button>

      <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
        已有账号？<Link href="/login" style={{ color: 'var(--blue)' }}>直接登录</Link>
      </p>
    </form>
  );
}

export function LoginForm({ captchaId }: CommonProps) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
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

    const { ok, data } = await post('/api/v1/auth/login', { username, password, captcha });

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

  return (
    <form className="card card-pad auth-card" onSubmit={submit}>
      <h1 className="page-title" style={{ fontSize: 20 }}>
        登录
      </h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        登录后才能发帖、评论、签署公约与进入后台。
      </p>

      <label className="field" style={{ marginTop: 16 }}>
        <span>用户名</span>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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

      <div style={{ marginTop: 12 }}>
        <CaptchaNotice captchaId={captchaId} />
        {needCaptcha && <Geetest captchaId={captchaId} onChange={setCaptcha} resetKey={resetKey} />}
      </div>

      {err && (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>
          {err}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}>
        {busy ? '登录中…' : '登录'}
      </button>

      <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
        还没有账号？<Link href="/register" style={{ color: 'var(--blue)' }}>注册</Link>
      </p>
    </form>
  );
}
