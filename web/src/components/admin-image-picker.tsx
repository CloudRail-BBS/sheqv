'use client';

import { useRef, useState } from 'react';
import { ADMIN_IMAGE_ACCEPT, uploadAdminImage, type AdminImageKind } from '@/lib/admin-image';

/**
 * 后台图片选择器：上传 / 更换 / 移除，也保留填外链的入口。
 *
 * 奖品图、卡面图、关于页的头像与 logo 都用这一个组件，区别只在 `kind`
 * （`reward` / `about`，服务端都只允许管理员上传）。
 * 上传成功只是把地址写回表单字段，真正落库仍然走各自保存时的提交。
 */
export function AdminImagePicker({
  value,
  onChange,
  label = '奖品图片（可空）',
  hint = 'PNG / JPEG / WebP / GIF，不超过 2 MB；中奖弹窗里按正方形展示，建议上传 1:1。',
  kind = 'reward',
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  kind?: AdminImageKind;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 外链输入：默认折叠，避免多一个必填框 */
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setErr(null);
    const result = await uploadAdminImage(file, kind);
    setBusy(false);
    if (!result.ok) {
      setErr(result.message);
      return;
    }
    onChange(result.url);
  }

  function useLink() {
    const url = link.trim();
    if (!url) return;
    onChange(url);
    setLink('');
    setLinkOpen(false);
  }

  return (
    <div className="field rw-imgpick">
      <span>{label}</span>

      <div className="rw-imgpick-row">
        <button
          type="button"
          className="rw-imgpick-frame"
          data-empty={!value}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={value ? '更换图片' : '上传图片'}
        >
          {value ? <img src={value} alt="" /> : <span className="rw-imgpick-plus">＋</span>}
          {busy && <i className="rw-imgpick-mask">上传中…</i>}
        </button>

        <div className="rw-imgpick-side">
          <div className="rw-imgpick-actions">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? '上传中…' : value ? '更换' : '上传图片'}
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  onChange('');
                  setErr(null);
                }}
                disabled={busy}
              >
                移除
              </button>
            )}
            <button
              type="button"
              className="rw-imgpick-linkbtn"
              onClick={() => setLinkOpen((v) => !v)}
              aria-expanded={linkOpen}
            >
              {linkOpen ? '收起外链' : '用外链'}
            </button>
          </div>

          {linkOpen ? (
            <div className="rw-imgpick-link">
              <input
                className="input mono"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    useLink();
                  }
                }}
                placeholder="https://…"
                autoFocus
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={useLink} disabled={!link.trim()}>
                使用
              </button>
            </div>
          ) : (
            <p className="rw-imgpick-hint">{hint}</p>
          )}

          {err && <p className="rw-imgpick-err">{err}</p>}
        </div>
      </div>

      <input ref={fileRef} type="file" accept={ADMIN_IMAGE_ACCEPT} hidden onChange={onPick} />
    </div>
  );
}
