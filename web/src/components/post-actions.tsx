'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  postId: string;
  likes: number;
  comments: number;
  /** 是否已签署社区公约 */
  signed: boolean;
  /** 是否已登录 */
  loggedIn: boolean;
}

export function PostActions({ postId, likes, comments, signed, loggedIn }: Props) {
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(likes);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function like() {
    if (liked) return;
    setLiked(true);
    setCount((c) => c + 1);
    const res = await fetch(`/api/v1/posts/${postId}/like`, { method: 'POST' });
    if (!res.ok) {
      setLiked(false);
      setCount((c) => c - 1);
    }
  }

  async function comment() {
    if (text.trim().length < 2) {
      setErr('评论至少 2 个字');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.message ?? data.error ?? '评论失败');
      return;
    }
    setText('');
    router.refresh();
  }

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" data-on={liked} onClick={like} style={liked ? { color: 'var(--accent)', borderColor: 'rgba(61,220,151,.35)' } : undefined}>
          {liked ? '已赞' : '点赞'} · {count}
        </button>
        <a className="btn btn-ghost" href="#comments">
          评论 · {comments}
        </a>
      </div>

      {!loggedIn ? (
        <div className="hint-box">
          登录后才能评论。<Link href="/login" style={{ color: 'var(--accent)' }}>登录</Link>
          <span className="muted"> · </span>
          <Link href="/register" style={{ color: 'var(--accent)' }}>注册</Link>
        </div>
      ) : signed ? (
        <>
          <label className="field">
            <span>写下你的看法</span>
            <textarea
              className="input textarea"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="不超过 300 字"
              maxLength={300}
            />
          </label>
          {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
          <button className="btn btn-primary" onClick={comment} disabled={busy}>
            {busy ? '发送中…' : '发表评论'}
          </button>
        </>
      ) : (
        <div className="hint-box">
          未签署《社区公约》不能评论。<Link href="/agreements" style={{ color: 'var(--accent)' }}>去签署</Link>
        </div>
      )}
    </div>
  );
}
