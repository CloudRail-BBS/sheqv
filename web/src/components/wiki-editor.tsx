'use client';

import { useState } from 'react';
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
      router.push('/wiki/mine?sent=1');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad wiki-editor">
      <div className="wiki-editor-head">
        <h1 className="page-title">{slug ? '编辑词条' : '投稿新词条'}</h1>
        <p className="small muted">
          提交后进入审核队列，管理员通过后才会公开。请尽量写清版本、来源与适用场景。
        </p>
      </div>

      <label className="field">
        <span>标题</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="例如：如何加入一个战队"
          autoFocus
        />
      </label>

      <div className="wiki-cat-row">
        <span className="wiki-cat-label">分类</span>
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

      <label className="field">
        <span>摘要（可选，200 字内，列表与搜索里展示）</span>
        <input
          className="input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={200}
          placeholder="一句话说清这条词条解决什么问题"
        />
      </label>

      <div className="wiki-editor-body">
        <span className="wiki-cat-label">正文</span>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          rows={18}
          maxLength={20000}
          placeholder="写正文…支持 Markdown，可直接粘贴或拖入图片。"
          onSubmit={() => void submit()}
        />
      </div>

      <div className="wiki-editor-foot">
        <span className="small muted">
          {bodyLen} 字 · {ready ? '可以提交审核' : titleLen < 2 ? '标题至少 2 字' : '正文至少 20 字'}
        </span>
        {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={busy || !ready}
        >
          {busy ? '提交中…' : '提交审核'}
        </button>
      </div>

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
