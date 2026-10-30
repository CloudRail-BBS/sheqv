'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 帖子详情里的两个交互块：
 *
 * - `PostLike`：楼层的点赞条（原来和评论框挤在一张卡里，改成楼层后各归各位）；
 * - `CommentComposer`：底部回复框，监听 `post:reply` 事件把「回复 某人：」填进去。
 */

export function PostLike({
  postId,
  likes,
  comments,
  loggedIn,
}: {
  postId: string;
  likes: number;
  comments: number;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(likes);
  const [busy, setBusy] = useState(false);

  async function like() {
    if (!loggedIn) {
      router.push('/login');
      return;
    }
    if (liked || busy) return;
    setBusy(true);
    setLiked(true);
    setCount((c) => c + 1);
    const res = await fetch(`/api/v1/posts/${postId}/like`, { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setLiked(false);
      setCount((c) => c - 1);
    }
  }

  return (
    <div className="floor-acts">
      <button type="button" className="act" data-on={liked} onClick={like} disabled={busy}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M7 11v9H4v-9h3Zm0 0 4.2-8a2 2 0 0 1 2.9 2.2L13 9h5.2a2 2 0 0 1 2 2.4l-1.4 7A2.5 2.5 0 0 1 16.4 20H7" />
        </svg>
        {liked ? '已赞' : '点赞'} · <span className="mono">{count}</span>
      </button>
      <a className="act" href="#comment-form">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-5.5A8 8 0 1 1 21 12Z" />
        </svg>
        回复 · <span className="mono">{comments}</span>
      </a>
    </div>
  );
}

export function CommentComposer({
  postId,
  signed,
  loggedIn,
  total,
}: {
  postId: string;
  signed: boolean;
  loggedIn: boolean;
  total: number;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 楼层里的「回复」按钮发事件过来：填好引用前缀并聚焦，用户接着写
  useEffect(() => {
    const onReply = (e: Event) => {
      const detail = (e as CustomEvent<{ floor: number; author: string }>).detail;
      if (!detail) return;
      setText(`回复 ${detail.author}：`);
      setErr(null);
      inputRef.current?.focus();
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) el.setSelectionRange(el.value.length, el.value.length);
      });
    };
    window.addEventListener('post:reply', onReply);
    return () => window.removeEventListener('post:reply', onReply);
  }, []);

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
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(false);
    if (!res?.ok) {
      setErr(data.message ?? data.error ?? '评论失败');
      return;
    }
    setText('');
    router.refresh();
  }

  return (
    <section id="comment-form" className="card card-pad comment-form">
      <div className="between" style={{ marginBottom: 8 }}>
        <h3 className="console-h3">写下你的回复</h3>
        <span className="small muted">
          {total > 0 ? `已有 ${total} 条回复` : '还没有回复'}
        </span>
      </div>

      {!loggedIn ? (
        <div className="hint-box">
          登录后才能回复。
          <Link href="/login">登录</Link>
          <span className="muted"> · </span>
          <Link href="/register">注册</Link>
        </div>
      ) : !signed ? (
        <div className="hint-box">
          未签署《社区公约》不能回复。<Link href="/agreements">去签署</Link>
        </div>
      ) : (
        <>
          <textarea
            ref={inputRef}
            className="input textarea"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="不超过 300 字；点某楼的「回复」会自动带上引用"
            maxLength={300}
          />
          <div className="comment-form-foot">
            <span className="small muted">{text.length} / 300</span>
            {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
            <button type="button" className="btn btn-primary btn-sm" onClick={comment} disabled={busy}>
              {busy ? '发送中…' : '发表回复'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
