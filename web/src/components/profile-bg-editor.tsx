'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 个人主页背景设置。
 *
 * 只接受 http(s) 或站内路径（后端会再校验一次），不做上传——
 * 背景图通常是一张图床链接，先保持零存储成本。
 */
export function ProfileBgEditor({ current }: { current?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function save(next: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileBg: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: next ? '背景已更新' : '背景已恢复默认' });
    setUrl(next);
    router.refresh();
  }

  return (
    <div className="card card-pad" style={{ marginTop: 12 }}>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 13 }}>主页背景</h3>
        <span className="small muted">http(s) 图片地址或站内路径</span>
      </div>

      <div className="bg-preview" data-empty={!url}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="背景预览" />
        ) : (
          <span className="small muted">默认渐变</span>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input
          className="input mono"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/logo-512.png 或 https://…/bg.jpg"
          maxLength={500}
          style={{ height: 32, fontSize: 12 }}
        />
        <button className="btn btn-sm btn-primary" onClick={() => save(url.trim())} disabled={busy}>
          {busy ? '保存中' : '保存'}
        </button>
        {current && (
          <button className="btn btn-sm btn-ghost" onClick={() => save('')} disabled={busy}>
            清除
          </button>
        )}
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 8 }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
