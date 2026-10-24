'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkdownEditor } from './markdown-editor';

const TOPICS = ['地图', '整合包', '材质', '约战', '招募', '提问'];

interface Props {
  /** 当前登录用户昵称；null 表示未登录 */
  nickname: string | null;
  /** 是否已签署社区公约 */
  signed: boolean;
  /** 头像；空则用昵称首字 */
  avatar?: string;
}

export function Composer({ nickname, signed, avatar }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 草稿：本地保存，刷新/误关不丢；发布成功后清掉
  useEffect(() => {
    if (!nickname) return;
    try {
      const raw = localStorage.getItem(`ba-draft-${nickname}`);
      if (!raw) return;
      const d = JSON.parse(raw) as { title?: string; body?: string; tags?: string[] };
      if (d.body || d.title) {
        setTitle(d.title ?? '');
        setBody(d.body ?? '');
        setTags(Array.isArray(d.tags) ? d.tags.slice(0, 3) : []);
      }
    } catch {
      /* 坏草稿直接忽略 */
    }
  }, [nickname]);

  useEffect(() => {
    if (!nickname) return;
    try {
      if (!title.trim() && !body.trim() && tags.length === 0) {
        localStorage.removeItem(`ba-draft-${nickname}`);
      } else {
        localStorage.setItem(`ba-draft-${nickname}`, JSON.stringify({ title, body, tags }));
      }
    } catch {
      /* 隐私模式下 localStorage 可能被禁 */
    }
  }, [nickname, title, body, tags]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const avatarNode = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="post-avatar-img" src={avatar} alt="" />
  ) : (
    nickname?.slice(0, 1) ?? '?'
  );

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body, tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? '发布失败');
      setTitle('');
      setBody('');
      setTags([]);
      setOpen(false);
      try {
        localStorage.removeItem(`ba-draft-${nickname}`);
      } catch {
        /* ignore */
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发布失败');
    } finally {
      setBusy(false);
    }
  }

  if (!nickname) {
    return (
      <div className="card composer">
        <div className="composer-top">
          <div className="post-avatar">?</div>
          <div className="composer-input" style={{ color: 'var(--muted)' }}>
            登录后即可发帖、评论与签署公约
          </div>
          <Link href="/register" className="btn btn-primary">
            注册
          </Link>
        </div>
        <div className="composer-actions">
          <span className="tip">
            已有账号？<Link href="/login" style={{ color: 'var(--blue)' }}>直接登录</Link>
          </span>
        </div>
      </div>
    );
  }

  if (!signed) {
    return (
      <div className="card composer">
        <div className="composer-top">
          <div className="post-avatar">{avatarNode}</div>
          <div className="composer-input" style={{ color: 'var(--amber)' }}>
            签署《社区公约》后才能发帖
          </div>
          <Link href="/agreements" className="btn btn-primary">
            去签署
          </Link>
        </div>
        <div className="composer-actions">
          <span className="tip">发帖、评论与上传资源都要求先签署社区公约</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="card composer composer-trigger"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="composer-top">
          <div className="post-avatar">{avatarNode}</div>
          <div className="composer-input">
            {title.trim() || body.trim() ? '继续编辑草稿…' : '说点什么…分享你的地图、战绩或问题'}
          </div>
          <button
            className="btn btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            发帖
          </button>
        </div>
        <div className="composer-actions">
          <span className="act">支持 Markdown</span>
          <span className="act">图片可粘贴 / 拖入</span>
          <span className="tip">点击打开独立编辑窗口</span>
        </div>
      </div>

      {open && (
        <div className="composer-modal" role="dialog" aria-modal="true" aria-label="发布新帖">
          <button
            type="button"
            className="composer-backdrop"
            aria-label="关闭编辑器"
            onClick={() => setOpen(false)}
          />
          <div className="composer-panel">
            <div className="composer-panel-head">
              <div className="post-avatar">{avatarNode}</div>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>发布新帖</b>
                <div className="small muted">以 {nickname} 的身份发布，即表示同意《社区公约》</div>
              </div>
              <button
                type="button"
                className="composer-close"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <input
              className="input composer-title"
              placeholder="标题：一句话说清你要讲什么（4–60 字）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              autoFocus
            />

            <div style={{ marginTop: 10 }}>
              <MarkdownEditor
                value={body}
                onChange={setBody}
                rows={10}
                placeholder="正文（至少 10 字）。可以贴链接、写配置、讲清楚复现步骤。"
                onSubmit={submit}
              />
            </div>

            <div className="row wrap composer-tags">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  data-on={tags.includes(t)}
                  onClick={() =>
                    setTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t].slice(0, 3)))
                  }
                >
                  #{t}
                </button>
              ))}
              <span className="tip" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                最多选 3 个话题
              </span>
            </div>

            <div className="composer-modal-foot">
              {err ? (
                <span className="tip" style={{ color: 'var(--danger)' }}>
                  {err}
                </span>
              ) : (
                <span className="tip">草稿会自动保存在本机，发布成功后清空</span>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? '发布中…' : '发布'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
