'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Slide } from '@/lib/slide-store';

const PRESET_COLORS = ['#0a0a0b', '#141416', '#1b1b1e', '#232327', '#2a2a2f', '#3f3f46'];

const EMPTY = {
  kicker: '',
  title: '',
  desc: '',
  cta: '了解更多',
  href: '/',
  bgColor: '#1b1b1e',
  bgImage: '',
  textTone: 'light' as 'light' | 'dark',
  active: true,
  order: 1,
};

export function SlideAdmin({ items }: { items: Slide[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function startEdit(s: Slide) {
    setEditing(s.id);
    setForm({
      kicker: s.kicker,
      title: s.title,
      desc: s.desc,
      cta: s.cta,
      href: s.href,
      bgColor: s.bgColor,
      bgImage: s.bgImage,
      textTone: s.textTone,
      active: s.active,
      order: s.order,
    });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    setEditing(null);
    setForm({ ...EMPTY, order: items.length + 1 });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const res = await fetch('/api/v1/admin/slides', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing, ...form } : form),
    }).catch(() => null);

    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);

    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: editing ? '已保存' : '已新增' });
    reset();
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    await fetch('/api/v1/admin/slides', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/v1/admin/slides?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (editing === id) reset();
    router.refresh();
  }

  return (
    <>
      <form className="card card-pad" onSubmit={submit} style={{ marginBottom: 12 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <h3 style={{ fontSize: 13 }}>{editing ? '编辑幻灯片' : '新增幻灯片'}</h3>
          {editing && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
              取消编辑
            </button>
          )}
        </div>

        <div className="adm-form" style={{ gridTemplateColumns: '160px 1fr' }}>
          <label className="field">
            <span>小标签</span>
            <input
              className="input"
              value={form.kicker}
              onChange={(e) => setForm({ ...form, kicker: e.target.value })}
              placeholder="如：赛季 / 公告"
              maxLength={16}
            />
          </label>
          <label className="field">
            <span>标题</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="2–48 字"
              maxLength={48}
              required
            />
          </label>
        </div>

        <label className="field" style={{ marginTop: 10 }}>
          <span>描述</span>
          <textarea
            className="input textarea"
            rows={2}
            value={form.desc}
            onChange={(e) => setForm({ ...form, desc: e.target.value })}
            maxLength={160}
            placeholder="一句话说明这张幻灯片要传达什么"
          />
        </label>

        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1.4fr 110px', marginTop: 10 }}>
          <label className="field">
            <span>按钮文案</span>
            <input
              className="input"
              value={form.cta}
              onChange={(e) => setForm({ ...form, cta: e.target.value })}
              maxLength={12}
            />
          </label>
          <label className="field">
            <span>按钮链接（站内路径或 http(s)）</span>
            <input
              className="input"
              value={form.href}
              onChange={(e) => setForm({ ...form, href: e.target.value })}
              placeholder="/agreements"
            />
          </label>
          <label className="field">
            <span>排序</span>
            <input
              className="input"
              type="number"
              min={1}
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <label className="field">
            <span>背景图 URL（可选，填了就覆盖背景色）</span>
            <input
              className="input"
              value={form.bgImage}
              onChange={(e) => setForm({ ...form, bgImage: e.target.value })}
              placeholder="https://…/banner.jpg"
            />
          </label>
          <label className="field">
            <span>背景色</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  data-on={form.bgColor.toLowerCase() === c}
                  style={{ background: c }}
                  aria-label={`使用 ${c}`}
                  onClick={() => setForm({ ...form, bgColor: c })}
                />
              ))}
              <input
                className="input mono"
                style={{ width: 96, height: 26, fontSize: 11 }}
                value={form.bgColor}
                onChange={(e) => setForm({ ...form, bgColor: e.target.value })}
                maxLength={32}
              />
            </div>
          </label>
        </div>

        <div className="row wrap" style={{ gap: 14, marginTop: 12 }}>
          <label className="field" style={{ minWidth: 130 }}>
            <span>文字颜色</span>
            <select
              className="input"
              value={form.textTone}
              onChange={(e) => setForm({ ...form, textTone: e.target.value as 'light' | 'dark' })}
            >
              <option value="light">浅色文字（深底）</option>
              <option value="dark">深色文字（浅底）</option>
            </select>
          </label>

          <label className="check" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>启用</span>
          </label>

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginLeft: 'auto' }}>
            {busy ? '保存中…' : editing ? '保存修改' : '新增'}
          </button>
        </div>

        {msg && (
          <p className="small" style={{ marginTop: 10, color: msg.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>
            {msg.text}
          </p>
        )}
      </form>

      <div className="slide-admin-list">
        {items.length === 0 ? (
          <div className="card card-pad small muted">
            还没有幻灯片。首页轮播会整块隐藏——用上面的表单加一张即可。
          </div>
        ) : (
          items.map((s) => (
            <div key={s.id} className="card slide-admin-item">
              <div
                className="slide-thumb"
                data-tone={s.textTone}
                style={{
                  background: s.bgImage ? `url("${s.bgImage}") center / cover no-repeat` : s.bgColor,
                }}
              >
                <span>{s.kicker}</span>
                <b>{s.title}</b>
              </div>
              <div className="slide-admin-meta">
                <div className="row" style={{ gap: 6 }}>
                  <span className={'badge ' + (s.active ? 'badge-live' : 'badge-ghost')}>
                    {s.active ? '展示中' : '已停用'}
                  </span>
                  <span className="mono small muted">#{s.order}</span>
                  <span className="small muted">→ {s.href}</span>
                </div>
                <p className="small muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
                  {s.desc || '（无描述）'}
                </p>
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => startEdit(s)}>
                    编辑
                  </button>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => patch(s.id, { active: !s.active })}>
                    {s.active ? '停用' : '启用'}
                  </button>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => remove(s.id)}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
