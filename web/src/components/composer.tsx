'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkdownEditor } from './markdown-editor';

const TOPICS = ['地图', '整合包', '材质', '约战', '招募', '提问'];
const CATEGORIES = [
  { key: '常规', desc: '日常分享与讨论' },
  { key: '提问', desc: '求解答、求助' },
  { key: '招募', desc: '找人组队或加入' },
  { key: '约战', desc: '发起比赛与约练' },
  { key: '闲聊', desc: '随便聊聊' },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

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
  const [category, setCategory] = useState('常规');
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 草稿：本地保存，刷新/误关不丢；发布成功后清掉
  useEffect(() => {
    if (!nickname) return;
    try {
      const raw = localStorage.getItem(`ba-draft-${nickname}`);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        title?: string;
        body?: string;
        tags?: string[];
        category?: string;
      };
      if (d.body || d.title) {
        setTitle(d.title ?? '');
        setBody(d.body ?? '');
        setTags(Array.isArray(d.tags) ? d.tags.slice(0, 3) : []);
        if (typeof d.category === 'string' && CATEGORY_KEYS.includes(d.category)) {
          setCategory(d.category);
        }
      }
    } catch {
      /* 坏草稿直接忽略 */
    }
  }, [nickname]);

  useEffect(() => {
    if (!nickname) return;
    try {
      if (!title.trim() && !body.trim() && tags.length === 0 && category === '常规') {
        localStorage.removeItem(`ba-draft-${nickname}`);
      } else {
        localStorage.setItem(
          `ba-draft-${nickname}`,
          JSON.stringify({ title, body, tags, category }),
        );
      }
    } catch {
      /* 隐私模式下 localStorage 可能被禁 */
    }
  }, [nickname, title, body, tags, category]);

  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!catRef.current?.contains(e.target as Node)) setCatOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [catOpen]);

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
    if (busy) return;
    let finalTitle = title.trim();
    let finalBody = body.trim();
    // 标题栏直接粘链接时，先变成「站点名 + 链接正文」，再校验长度
    if (/^https?:\/\/\S+$/.test(finalTitle) && !finalBody) {
      try {
        const host = new URL(finalTitle).hostname.replace(/^www\./, '');
        finalBody = `[${finalTitle}](${finalTitle})`;
        finalTitle = `${host} 分享`;
      } catch {
        /* 保留原文，交给服务端校验 */
      }
    }
    if (finalTitle.length < 4 || finalTitle.length > 60) {
      setErr('标题需为 4–60 字');
      return;
    }
    if (finalBody.length < 10) {
      setErr('正文至少 10 字');
      return;
    }
    if (finalBody.length > 8000) {
      setErr('正文不超过 8000 字');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const allTags =
        category === '常规' ? tags : Array.from(new Set([category, ...tags])).slice(0, 3);
      const res = await fetch('/api/v1/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: finalTitle, body: finalBody, tags: allTags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? '发布失败');
      setTitle('');
      setBody('');
      setTags([]);
      setCategory('常规');
      setExpanded(false);
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
        <div className="composer-modal" role="dialog" aria-modal="true" aria-label="创建帖子">
          <button
            type="button"
            className="composer-backdrop"
            aria-label="关闭编辑器"
            onClick={() => setOpen(false)}
          />
          <div className={'composer-panel' + (expanded ? ' is-expanded' : '')}>
            <div className="composer-panel-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <b className="composer-head-title">创建帖子</b>
                <div className="composer-head-sub">以 {nickname} 的身份发布</div>
              </div>
              <div className="composer-head-actions">
                <button
                  type="button"
                  className="composer-icon-btn"
                  aria-label={expanded ? '还原大小' : '放大编辑'}
                  title={expanded ? '还原大小' : '放大编辑'}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? '⤡' : '⤢'}
                </button>
                <button
                  type="button"
                  className="composer-icon-btn"
                  aria-label="关闭"
                  title="关闭"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="composer-meta">
              <div className="composer-cat" ref={catRef}>
                <span className="composer-meta-label">版块</span>
                <button
                  type="button"
                  className="composer-cat-btn"
                  aria-haspopup="listbox"
                  aria-expanded={catOpen}
                  onClick={() => setCatOpen((v) => !v)}
                >
                  <span>{category}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7 9 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {catOpen && (
                  <div className="composer-cat-menu" role="listbox">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className="composer-cat-option"
                        data-on={category === c.key}
                        role="option"
                        aria-selected={category === c.key}
                        onClick={() => {
                          setCategory(c.key);
                          if (c.key !== '常规') setTags((v) => v.slice(0, 2));
                          setCatOpen(false);
                        }}
                      >
                        <span>
                          <b>{c.key}</b>
                          <em>{c.desc}</em>
                        </span>
                        {category === c.key && (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="composer-tags-line">
                <span className="composer-meta-label">
                  标签
                  <em className="composer-meta-hint">最多 {category === '常规' ? 3 : 2} 个</em>
                </span>
                <div className="composer-topic-row">
                  {TOPICS.map((t) => {
                    const limit = category === '常规' ? 3 : 2;
                    return (
                      <button
                        key={t}
                        type="button"
                        className="composer-tag"
                        data-on={tags.includes(t)}
                        onClick={() =>
                          setTags((v) =>
                            v.includes(t)
                              ? v.filter((x) => x !== t)
                              : [...v, t].slice(0, limit),
                          )
                        }
                      >
                        <span>#</span>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <input
              className="composer-title-input"
              placeholder="输入标题，或在此处粘贴链接"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              autoFocus
            />

            <MarkdownEditor
              variant="composer"
              value={body}
              onChange={setBody}
              rows={12}
              maxLength={8000}
              placeholder="在此输入。使用工具栏或 Markdown 进行格式化，拖动或粘贴图片。"
              onSubmit={submit}
              leading={
                <span className="composer-me">
                  <span className="composer-me-avatar">{avatarNode}</span>
                  <b>ME</b>
                </span>
              }
              actions={
                <>
                  <span className="composer-count">{body.length} 字</span>
                  {err ? (
                    <span className="composer-err">{err}</span>
                  ) : (
                    <span className="composer-saved">草稿已自动保存</span>
                  )}
                  <button
                    type="button"
                    className="composer-discard"
                    onClick={() => setOpen(false)}
                    disabled={busy}
                  >
                    舍弃
                  </button>
                  <button
                    type="button"
                    className="composer-submit"
                    onClick={submit}
                    disabled={busy}
                  >
                    {busy ? '发布中…' : '创建帖子'}
                  </button>
                </>
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
