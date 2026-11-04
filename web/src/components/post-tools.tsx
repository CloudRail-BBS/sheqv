'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

/**
 * 楼主这一楼右上角的操作：
 *
 * - 作者本人（或有审核权的人）→ 「编辑」打开二次编辑弹窗；
 * - 管理员 → 「置顶 / 精华」两个开关，直接打后台接口。
 *
 * 编辑只改标题与正文，帖子状态不变；保存后 `router.refresh()` 重新拉服务端数据，
 * 这样「已编辑」时间和正文渲染都以服务端为准。
 */
export function PostTools({
  postId,
  title,
  body,
  canEdit,
  canModerate,
  pinned,
  featured,
  canNotice = false,
  adminNote = '',
}: {
  postId: string;
  title: string;
  body: string;
  canEdit: boolean;
  canModerate: boolean;
  pinned: boolean;
  featured: boolean;
  /** 管理员：可以给任意帖子加声明 */
  canNotice?: boolean;
  /** 当前声明（空串表示没有） */
  adminNote?: string;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title, body });
  const [busy, setBusy] = useState(false);
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flags, setFlags] = useState({ pinned, featured });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [note, setNote] = useState(adminNote);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeErr, setNoticeErr] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open && !noticeOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (open && !busy) setOpen(false);
      if (noticeOpen && !noticeBusy) setNoticeOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, noticeOpen, noticeBusy]);

  function close() {
    if (busy) return;
    setOpen(false);
    setErr(null);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/v1/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: form.title.trim(), body: form.body }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setErr(data?.message ?? '保存失败');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function saveNotice() {
    if (noticeBusy) return;
    setNoticeBusy(true);
    setNoticeErr(null);
    const res = await fetch(`/api/v1/posts/${postId}/notice`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: note.trim() }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setNoticeBusy(false);
    if (!res?.ok) {
      setNoticeErr(data?.message ?? '保存失败');
      return;
    }
    setNoticeOpen(false);
    router.refresh();
  }

  async function toggle(kind: 'pinned' | 'featured') {
    if (flagBusy) return;
    setFlagBusy(kind);
    const next = { ...flags, [kind]: !flags[kind] };
    const res = await fetch(`/api/v1/posts/${postId}/flags`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [kind]: next[kind] }),
    }).catch(() => null);
    setFlagBusy(null);
    if (!res?.ok) return;
    setFlags(next);
    router.refresh();
  }

  if (!canEdit && !canModerate) return null;

  return (
    <>
      <div className="pb-tools">
        {canEdit && (
          <button type="button" className="pb-tool" onClick={() => setOpen(true)}>
            编辑
          </button>
        )}
        {canNotice && (
          <button
            type="button"
            className="pb-tool"
            data-on={Boolean(adminNote)}
            onClick={() => {
              setNote(adminNote);
              setNoticeErr(null);
              setNoticeOpen(true);
            }}
          >
            {adminNote ? '改声明' : '声明'}
          </button>
        )}
        {canModerate && (
          <>
            <button
              type="button"
              className="pb-tool"
              data-on={flags.pinned}
              disabled={flagBusy === 'pinned'}
              onClick={() => toggle('pinned')}
            >
              {flags.pinned ? '已置顶' : '置顶'}
            </button>
            <button
              type="button"
              className="pb-tool"
              data-on={flags.featured}
              disabled={flagBusy === 'featured'}
              onClick={() => toggle('featured')}
            >
              {flags.featured ? '已精华' : '精华'}
            </button>
          </>
        )}
      </div>

      {mounted &&
        noticeOpen &&
        createPortal(
          <div className="composer-modal" role="dialog" aria-modal="true" aria-label="管理员声明">
            <button
              type="button"
              className="composer-backdrop"
              aria-label="关闭"
              onClick={() => !noticeBusy && setNoticeOpen(false)}
            />
            <div className="composer-panel org-modal" style={{ width: 'min(560px, 94vw)' }}>
              <div className="composer-panel-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="composer-head-title">管理员声明</b>
                  <div className="composer-head-sub">
                    显示在正文上方，编辑帖子不会覆盖它
                  </div>
                </div>
                <button
                  type="button"
                  className="composer-icon-btn"
                  aria-label="关闭"
                  onClick={() => setNoticeOpen(false)}
                >
                  ×
                </button>
              </div>

              <label className="field">
                声明内容
                <textarea
                  className="input textarea"
                  rows={5}
                  maxLength={500}
                  value={note}
                  placeholder="例如：本帖涉及的信息尚未核实，请以官方公告为准。"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>

              {noticeErr && (
                <p className="small" style={{ marginTop: 8, color: 'var(--danger)' }}>
                  {noticeErr}
                </p>
              )}

              <div className="composer-modal-foot">
                <span className="tip">{note.length} / 500 · 留空保存即取消声明</span>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setNoticeOpen(false)}
                    disabled={noticeBusy}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => void saveNotice()}
                    disabled={noticeBusy}
                  >
                    {noticeBusy ? '保存中…' : '保存声明'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {mounted &&
        open &&
        createPortal(
          <div className="composer-modal" role="dialog" aria-modal="true" aria-label="编辑帖子">
            <button type="button" className="composer-backdrop" aria-label="关闭" onClick={close} />
            <div className="composer-panel org-modal" style={{ width: 'min(720px, 94vw)' }}>
              <div className="composer-panel-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="composer-head-title">编辑帖子</b>
                  <div className="composer-head-sub">
                    保存后会显示「已编辑」，正文支持 Markdown
                  </div>
                </div>
                <button type="button" className="composer-icon-btn" aria-label="关闭" onClick={close}>
                  ×
                </button>
              </div>

              <label className="field">
                标题
                <input
                  className="input"
                  value={form.title}
                  maxLength={80}
                  placeholder="留空则不显示标题"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>

              <label className="field" style={{ marginTop: 10 }}>
                正文
                <textarea
                  className="input textarea"
                  rows={12}
                  maxLength={8000}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.75 }}
                />
              </label>

              {err && (
                <p className="small" style={{ marginTop: 8, color: 'var(--danger)' }}>
                  {err}
                </p>
              )}

              <div className="composer-modal-foot">
                <span className="tip">{form.body.length} / 8000</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={close} disabled={busy}>
                  取消
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
                  {busy ? '保存中…' : '保存修改'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
