'use client';

import { useRef, useState } from 'react';
import { REWARD_IMAGE_ACCEPT, uploadRewardImage } from '@/lib/reward-image';

/**
 * 奖品图片选择器：上传 / 更换 / 移除，也保留填外链的入口。
 *
 * 后台配奖品时以前只有一个「图片地址」输入框，得先把图传到别处再回来粘。
 * 这里直接选本地文件，走 `/api/v1/me/media?kind=reward` 存进本站媒体库，
 * 返回的地址写回表单字段（提交时才落库，所以取消表单不会留下半个奖品）。
 */
export function RewardImagePicker({
  value,
  onChange,
  label = '奖品图片（可空）',
  hint = 'PNG / JPEG / WebP / GIF，不超过 2 MB；中奖弹窗里按正方形展示，建议上传 1:1。',
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
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
    const result = await uploadRewardImage(file);
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
          aria-label={value ? '更换奖品图片' : '上传奖品图片'}
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

      <input ref={fileRef} type="file" accept={REWARD_IMAGE_ACCEPT} hidden onChange={onPick} />
    </div>
  );
}
