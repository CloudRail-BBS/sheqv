'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CaptchaDialog } from './captcha-dialog';
import type { CaptchaPayload } from './geetest';

/**
 * 帖子详情里的两个交互块：
 *
 * - `PostLike`：楼层的点赞条（原来和评论框挤在一张卡里，改成楼层后各归各位）；
 * - `CommentComposer`：底部回复框，监听 `post:reply` 事件把「回复 某人：」填进去。
 */

export function PostLike({
  postId,
  likes,
  liked: initialLiked,
  comments,
  loggedIn,
}: {
  postId: string;
  likes: number;
  /** 服务端记录的「我有没有点过」 */
  liked: boolean;
  comments: number;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(likes);
  const [busy, setBusy] = useState(false);

  async function like() {
    if (!loggedIn) {
      router.push('/login');
      return;
    }
    if (busy) return;
    const next = !liked;
    setBusy(true);
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const res = await fetch(`/api/v1/posts/${postId}/like`, { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setLiked(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      return;
    }
    const data = (await res.json().catch(() => null)) as { likes?: number; liked?: boolean } | null;
    if (data && typeof data.likes === 'number') {
      setCount(data.likes);
      setLiked(Boolean(data.liked));
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
  captchaId = '',
  mutedUntil = 0,
  muteReason = '',
}: {
  postId: string;
  signed: boolean;
  loggedIn: boolean;
  total: number;
  captchaId?: string;
  /** 禁言到期（毫秒）；大于当前时间说明还在禁言期 */
  mutedUntil?: number;
  muteReason?: string;
}) {
  const router = useRouter();
  const muted = mutedUntil > Date.now();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const draftKey = `ba-comment-${postId}`;

  // 刷新页面或跳走再回来，没发出去的回复还在（会话级，关掉标签页就清）
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {
      /* 隐私模式下 sessionStorage 可能被禁 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 输入框跟着内容长高，长回复不用在小框里滚
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* 同上 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // 楼层里的「回复」按钮发事件过来：填好引用前缀并聚焦，用户接着写
  useEffect(() => {
    const onReply = (e: Event) => {
      const detail = (e as CustomEvent<{ floor: number; author: string }>).detail;
      if (!detail) return;
      setText(`回复 ${detail.author}：`);
      setReplyTo(detail.author);
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
    await doComment();
  }

  async function doComment(proofArg?: CaptchaPayload | null) {
    if (text.trim().length < 2) {
      setErr('评论至少 2 个字');
      return;
    }
    const proof = proofArg ?? captcha;
    if (captchaId && !proof && !captchaOpen) {
      setCaptchaOpen(true);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: text, captcha: proof ?? undefined }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      comment?: { floor?: number };
    };
    setBusy(false);
    if (!res?.ok) {
      setCaptcha(null);
      setErr(data.message ?? data.error ?? '评论失败');
      return;
    }
    setText('');
    setReplyTo(null);
    const floor = data.comment?.floor;
    router.refresh();
    // 刷新后把这楼滚进视野：新回复通常在最下面
    if (typeof floor === 'number') {
      setTimeout(() => {
        document.getElementById(`post-${floor}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }
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
      ) : muted ? (
        <div className="hint-box" data-tone="warn">
          <b>你正在被禁言</b>
          <span>
            解除时间 {new Date(mutedUntil).toLocaleString('zh-CN', { hour12: false })}
            {muteReason ? `（原因：${muteReason}）` : ''}
            {'，期间不能回复。'}
          </span>
        </div>
      ) : (
        <>
          {replyTo && (
            <div className="reply-chip">
              <span>回复 {replyTo}</span>
              <button
                type="button"
                aria-label="取消引用"
                onClick={() => {
                  setReplyTo(null);
                  setText('');
                }}
              >
                ×
              </button>
            </div>
          )}
          <div className="comment-box">
            <textarea
              ref={inputRef}
              className="textarea"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // ⌘/Ctrl + Enter 直接发送：长回复不用再去点按钮
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!busy && text.trim().length >= 2) void comment();
                }
              }}
              placeholder="说点什么…（点某楼的「回复」会自动引用）"
              maxLength={300}
            />
            <div className="comment-form-foot">
              <span className="count" data-near={text.length >= 260 ? 'true' : undefined}>
                {text.length} / 300
              </span>
              <span className="kbd-hint">
                <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 发送
              </span>
              {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
              <button type="button" className="btn btn-primary btn-sm" onClick={comment} disabled={busy}>
                {busy ? '发送中…' : '发表回复'}
              </button>
            </div>
          </div>
        </>
      )}

      <CaptchaDialog
        open={captchaOpen}
        captchaId={captchaId}
        onDone={(p) => {
          setCaptcha(p);
          setCaptchaOpen(false);
          void doComment(p);
        }}
        onCancel={() => setCaptchaOpen(false)}
      />
    </section>
  );
}
