'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ServerKind } from '@/lib/server-types';

/**
 * 上传面板：我的世界服务器 / Rusted Warfare 中转站。
 *
 * 两类条目共用一套表单，切 kind 时只换「要填什么」。上传不做人工审核
 * （站长要求自由上传），所以提交成功就刷新页面，状态由后台探测补上。
 */
export function ServerUpload({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<ServerKind>('minecraft');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [edition, setEdition] = useState<'java' | 'bedrock'>('java');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isMc = kind === 'minecraft';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);

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
      setMsg({ kind: 'err', text: data?.message ?? '上传失败，稍后再试' });
      return;
    }

    setMsg({ kind: 'ok', text: '已提交，状态会在半分钟内自动探测出来' });
    setName('');
    setHost('');
    setPort('');
    setDescription('');
    setTags('');
    router.refresh();
  }

  if (!loggedIn) {
    return (
      <div className="card rail-card">
        <div className="rail-title">上传服务器</div>
        <p className="small muted" style={{ lineHeight: 1.8 }}>
          登录后可以把自己的服务器或中转站挂到大厅。
        </p>
        <Link href="/login" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 12 }}>
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form className="card rail-card" onSubmit={submit}>
      <div className="rail-title">上传服务器</div>

      <div className="seg" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="seg-btn"
          data-on={isMc}
          onClick={() => {
            setKind('minecraft');
            setMsg(null);
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
            setMsg(null);
          }}
        >
          Rusted Warfare
        </button>
      </div>

      <label className="field">
        名称
        <input
          className="input"
          value={name}
          maxLength={24}
          placeholder={isMc ? '例如：方块生存服' : '例如：CNKD 上海'}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <label className="field" style={{ marginTop: 10 }}>
        {isMc ? '服务器地址' : '中转站地址'}
        <input
          className="input"
          value={host}
          placeholder={isMc ? 'play.example.com' : 'http://1.2.3.4:46784'}
          onChange={(e) => setHost(e.target.value)}
          required
        />
      </label>

      {isMc ? (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <label className="field" style={{ flex: 1 }}>
            端口
            <input
              className="input"
              value={port}
              inputMode="numeric"
              placeholder={edition === 'bedrock' ? '19132' : '25565'}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            版本
            <select
              className="input"
              value={edition}
              onChange={(e) => setEdition(e.target.value as 'java' | 'bedrock')}
            >
              <option value="java">Java</option>
              <option value="bedrock">基岩版</option>
            </select>
          </label>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
          填中转站的根地址，房间会实时从这里读。粘 <code>/relay/rooms</code> 也行，会自动去掉。
        </p>
      )}

      <label className="field" style={{ marginTop: 10 }}>
        简介
        <textarea
          className="input textarea"
          rows={2}
          maxLength={200}
          value={description}
          placeholder="一句话说明玩法，选填"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="field" style={{ marginTop: 10 }}>
        标签
        <input
          className="input"
          value={tags}
          placeholder="生存、PvP、小游戏（最多 3 个）"
          onChange={(e) => setTags(e.target.value)}
        />
      </label>

      {msg && (
        <p
          className="small"
          style={{
            marginTop: 10,
            color: msg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)',
          }}
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 12 }}
        disabled={busy}
      >
        {busy ? '提交中…' : '提交到大厅'}
      </button>
      <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
        自由上传，不需要审核。填错地址会显示离线，随时可以删掉重传。
      </p>
    </form>
  );
}
