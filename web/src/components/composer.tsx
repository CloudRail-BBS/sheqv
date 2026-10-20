'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TOPICS = ['地图', '整合包', '材质', '约战', '招募', '提问'];

interface Props {
  /** 当前登录用户昵称；null 表示未登录 */
  nickname: string | null;
  /** 是否已签署社区公约 */
  signed: boolean;
}

export function Composer({ nickname, signed }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          <div className="post-avatar">{nickname.slice(0, 1)}</div>
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
    <div className="card composer">
      <div className="composer-top">
        <div className="post-avatar">{nickname.slice(0, 1)}</div>
        {open ? (
          <input
            className="input grow"
            placeholder="标题：一句话说清你要讲什么（4–60 字）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            autoFocus
          />
        ) : (
          <div className="composer-input" onClick={() => setOpen(true)}>
            说点什么…分享你的地图、战绩或问题
          </div>
        )}
        <button className="btn btn-primary" onClick={open ? submit : () => setOpen(true)} disabled={busy}>
          {busy ? '发布中…' : '发布'}
        </button>
      </div>

      {open && (
        <>
          <textarea
            className="input textarea"
            style={{ marginTop: 10, width: '100%' }}
            rows={4}
            placeholder="正文（至少 10 字）。可以贴链接、写配置、讲清楚复现步骤。"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {TOPICS.map((t) => (
              <button
                key={t}
                className="chip"
                data-on={tags.includes(t)}
                onClick={() => setTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t].slice(0, 3)))}
              >
                #{t}
              </button>
            ))}
            <span className="tip" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
              最多选 3 个话题
            </span>
          </div>
        </>
      )}

      <div className="composer-actions">
        <span className="act">图片</span>
        <span className="act">投票</span>
        <span className="act">话题</span>
        {err ? (
          <span className="tip" style={{ color: 'var(--danger)' }}>
            {err}
          </span>
        ) : (
          <span className="tip">以 {nickname} 的身份发布，即表示同意《社区公约》</span>
        )}
      </div>
    </div>
  );
}
