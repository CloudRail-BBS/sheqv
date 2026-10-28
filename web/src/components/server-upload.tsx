'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { ServerKind } from '@/lib/server-types';

/**
 * 上传服务器：悬浮窗。
 *
 * 原先是侧栏里的一张常驻表单，占掉右栏一整屏；改成按钮 + 弹窗后，
 * 「看大厅」和「传服务器」两件事不再互相挤压。
 *
 * 提交后进入 `pending`，由管理员在后台审核；通过前大厅里看不到，
 * 但「我的提交」会显示状态，避免用户以为传丢了。
 */
export function ServerUpload({
  loggedIn,
  defaultKind = 'minecraft',
}: {
  loggedIn: boolean;
  defaultKind?: ServerKind;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ServerKind>(defaultKind);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [edition, setEdition] = useState<'java' | 'bedrock'>('java');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isMc = kind === 'minecraft';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy]);

  function close() {
    if (busy) return;
    setOpen(false);
    // 关掉时重置成功态，下次打开是干净表单；字段保留，方便连续提交
    setDone(false);
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);

    const res = await fetch('/api/v1/servers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        name: name.trim(),
        host: host.trim(),
        // 留空交给后端按版本取默认端口
        port: isMc && port.trim() ? Number(port.trim()) : 0,
        edition: isMc ? edition : '',
        description: description.trim(),
        tags: tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 3),
      }),
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setErr(data?.message ?? '提交失败，稍后再试');
      return;
    }

    setDone(true);
    setName('');
    setHost('');
    setPort('');
    setDescription('');
    setTags('');
    router.refresh();
  }

  const trigger = loggedIn ? (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
      上传服务器
    </button>
  ) : (
    <Link href="/login" className="btn btn-sm btn-ghost">
      登录后上传
    </Link>
  );

  return (
    <>
      {trigger}

      {mounted && open && createPortal(
        <div className="composer-modal" role="dialog" aria-modal="true" aria-label="上传服务器">
          <button
            type="button"
            className="composer-backdrop"
            aria-label="关闭"
            onClick={close}
          />
          <div className="composer-panel srv-modal">
            <div className="composer-panel-head">
              <span className="composer-head-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M4 5h16v6H4zM4 15h16v4H4zM7.5 8h.01M7.5 17h.01"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b className="composer-head-title">上传服务器</b>
                <div className="composer-head-sub">
                  提交后由管理员审核，通过后才会出现在联机大厅
                </div>
              </div>
              <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={close}>
                ×
              </button>
            </div>

            {done ? (
              <div className="srv-done">
                <span className="srv-done-mark" aria-hidden="true">✓</span>
                <b>已提交，等待审核</b>
                <p>
                  管理员通过后会出现在大厅，状态可以在「我的提交」里看。
                  探测会在通过后自动开始，不用再点刷新。
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={close}>
                  知道了
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="srv-form-wrap">
                <div className="seg srv-kind">
                  <button
                    type="button"
                    className="seg-btn"
                    data-on={isMc}
                    onClick={() => {
                      setKind('minecraft');
                      setErr(null);
                    }}
                  >
                    我的世界
                  </button>
                  <button
                    type="button"
                    className="seg-btn"
                    data-on={!isMc}
                    onClick={() => {
                      setKind('rusted_warfare');
                      setErr(null);
                    }}
                  >
                    Rusted Warfare
                  </button>
                </div>

                <div className="srv-form">
                  <label className="field span2">
                    <span>名称</span>
                    <input
                      className="input"
                      value={name}
                      maxLength={24}
                      placeholder={isMc ? '例如：方块生存服' : '例如：CNKD 上海'}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoFocus
                    />
                  </label>

                  <label className="field span2">
                    <span>{isMc ? '服务器地址' : '中转站地址'}</span>
                    <input
                      className="input mono"
                      value={host}
                      placeholder={isMc ? 'play.example.com' : 'http://1.2.3.4:46784'}
                      onChange={(e) => setHost(e.target.value)}
                      required
                    />
                  </label>

                  {isMc && (
                    <>
                      <label className="field">
                        <span>端口</span>
                        <input
                          className="input"
                          value={port}
                          inputMode="numeric"
                          placeholder={edition === 'bedrock' ? '19132' : '25565'}
                          onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        />
                      </label>
                      <label className="field">
                        <span>版本</span>
                        <select
                          className="input"
                          value={edition}
                          onChange={(e) => setEdition(e.target.value as 'java' | 'bedrock')}
                        >
                          <option value="java">Java</option>
                          <option value="bedrock">基岩版</option>
                        </select>
                      </label>
                    </>
                  )}

                  <label className="field span2">
                    <span>简介</span>
                    <textarea
                      className="input textarea"
                      rows={3}
                      maxLength={200}
                      value={description}
                      placeholder="一句话说明玩法，选填"
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>

                  <label className="field span2">
                    <span>标签（最多 3 个）</span>
                    <input
                      className="input"
                      value={tags}
                      placeholder="生存、PvP、小游戏"
                      onChange={(e) => setTags(e.target.value)}
                    />
                  </label>
                </div>

                {!isMc && (
                  <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
                    填中转站的根地址，房间会实时从这里读取；粘 <code>/relay/rooms</code> 也行，会自动去掉。
                  </p>
                )}

                {err && (
                  <p className="small" style={{ marginTop: 10, color: 'var(--danger)' }}>
                    {err}
                  </p>
                )}

                <div className="srv-modal-foot">
                  <span className="small muted">填错可以在「我的提交」里删掉重传。</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={close} disabled={busy}>
                    取消
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                    {busy ? '提交中…' : '提交审核'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
