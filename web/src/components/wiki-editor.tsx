'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MarkdownEditor } from './markdown-editor';
import { CaptchaDialog } from './captcha-dialog';
import type { CaptchaPayload } from './geetest';
import type { ContentCategory } from '@/lib/category-types';

/**
 * 百科投稿编辑器（新建与修改共用）。
 *
 * 提交不会直接改词条：先落 wiki_submissions，管理员审核通过才公开。
 * 人机验证复用发帖那套极验：站点配了 id 就弹验证层，没配就直接提交。
 */
export function WikiEditor({
  slug,
  initial,
  captchaId = '',
  categories = [],
  inModal = false,
  onSent,
  onCancel,
  onDirtyChange,
}: {
  /** 修改已有词条时传 slug */
  slug?: string;
  initial?: {
    title: string;
    summary: string;
    category: string;
    body: string;
    tags: string[];
  };
  captchaId?: string;
  /** 分类由后台维护，服务端取好传进来 */
  categories?: ContentCategory[];
  /** 弹窗里渲染：不画自己的大标题，交给弹窗外壳 */
  inModal?: boolean;
  /** 提交成功后的回调；不传则跳「我的投稿」 */
  onSent?: () => void;
  /** 取消；不传则回列表页 */
  onCancel?: () => void;
  /** 内容是否有改动（弹窗用来决定关闭前要不要确认） */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [category, setCategory] = useState(initial?.category ?? categories[0]?.key ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [captchaOpen, setCaptchaOpen] = useState(false);

  const titleLen = title.trim().length;
  const bodyLen = body.trim().length;

  // 与初始内容比对，判断有没有改过；弹窗关闭前据此提示
  const dirty = initial
    ? title !== initial.title ||
      summary !== initial.summary ||
      category !== initial.category ||
      body !== initial.body
    : title.trim() !== '' || summary.trim() !== '' || body.trim() !== '';
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const ready =
    titleLen >= 2 && titleLen <= 60 && bodyLen >= 20 && categories.length > 0;

  async function submit(proofArg?: CaptchaPayload | null) {
    if (busy) return;
    const proof = proofArg ?? captcha;
    if (captchaId && !proof && !captchaOpen) {
      setCaptchaOpen(true);
      return;
    }
    if (titleLen < 2 || titleLen > 60) {
      setErr('标题需为 2–60 字');
      return;
    }
    if (bodyLen < 20) {
      setErr('正文至少 20 字');
      return;
    }
    if (!category) {
      setErr('还没有可用分类，请联系管理员在后台添加');
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/wiki/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          category,
          body,
          tags: initial?.tags ?? [],
          entrySlug: slug ?? '',
          captcha: proof ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setCaptcha(null);
        throw new Error(data.message ?? data.error ?? '提交失败');
      }
      if (onSent) {
        onSent();
      } else {
        router.push('/wiki/mine?sent=1');
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  const current = categories.find((c) => c.key === category);

  return (
    <div className="card wiki-editor" data-in-modal={inModal}>
      {!inModal && (
      <header className="we-head">
        <div className="we-head-main">
          <span className="we-kicker">社区百科 · 投稿</span>
          <h1 className="we-title">{slug ? '编辑词条' : '投稿新词条'}</h1>
          <p>
            提交后进入审核队列，管理员通过后才会公开。写清版本、来源与适用场景，过审会更快。
          </p>
        </div>
        <ol className="we-steps" aria-label="流程">
          <li data-on="true">填写</li>
          <li>审核</li>
          <li>公开</li>
        </ol>
      </header>
      )}

      <div className="we-body">
      <section className="we-section">
        <div className="we-label">
          <b>标题</b>
          <em>{titleLen}/60</em>
        </div>
        <input
          className="input we-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="例如：如何加入一个战队"
          autoFocus
        />
      </section>

      <section className="we-section">
        <div className="we-label">
          <b>分类</b>
          <span>{current?.descr || '选一个最接近的，审核时也方便归类'}</span>
        </div>
        <div className="we-cats">
          {categories.length === 0 ? (
            <span className="small muted">后台还没有配置分类，暂时无法投稿。</span>
          ) : (
            categories.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip"
                data-on={category === c.key}
                title={c.descr || undefined}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))
          )}
        </div>
      </section>

      <section className="we-section">
        <div className="we-label">
          <b>摘要</b>
          <span>一句话说清这条词条解决什么问题，列表和搜索里会用到</span>
          <em>{summary.length}/200</em>
        </div>
        <textarea
          className="input textarea we-summary"
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={200}
          placeholder="可选。例如：从建队、报名到提交名单的完整流程"
        />
      </section>

      <section className="we-section we-section-body">
        <div className="we-label">
          <b>正文</b>
          <span>支持 Markdown，可直接粘贴或拖入图片</span>
          <em>{bodyLen} 字</em>
        </div>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          rows={18}
          maxLength={20000}
          placeholder="写正文…支持 Markdown，可直接粘贴或拖入图片。"
          onSubmit={() => void submit()}
        />
      </section>
      </div>

      <footer className="we-foot">
        <span className="we-status" data-ok={ready}>
          <i aria-hidden="true" />
          {ready ? '可以提交审核' : titleLen < 2 ? '标题至少 2 字' : '正文至少 20 字'}
        </span>
        {err && (
          <span className="small we-err" role="alert">
            {err}
          </span>
        )}
        <div className="we-foot-acts">
          {onCancel ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
              取消
            </button>
          ) : (
            <Link
              href={slug ? `/wiki/${encodeURIComponent(slug)}` : '/wiki'}
              className="btn btn-sm btn-ghost"
            >
              取消
            </Link>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy || !ready}
          >
            {busy ? '提交中…' : '提交审核'}
          </button>
        </div>
      </footer>

      <CaptchaDialog
        open={captchaOpen}
        captchaId={captchaId}
        onDone={(p) => {
          setCaptcha(p);
          setCaptchaOpen(false);
          void submit(p);
        }}
        onCancel={() => setCaptchaOpen(false)}
      />
    </div>
  );
}
