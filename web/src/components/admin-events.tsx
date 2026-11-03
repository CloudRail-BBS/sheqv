'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EventItem, EventStatus } from '@/lib/event-types';
import { EVENT_STATUS_LABEL, fmtEventRange } from '@/lib/event-types';
import { AdminImagePicker } from './admin-image-picker';

const EMPTY = {
  title: '',
  summary: '',
  body: '',
  cover: '',
  reward: '',
  startsAt: '',
  endsAt: '',
  status: 'draft' as EventStatus,
  sort: '0',
};

/** 后台 · 活动：建一个活动、改状态、看报名人数 */
export function AdminEvents({ initial }: { initial: EventItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function reload() {
    const res = await fetch('/api/v1/admin/events', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { items: EventItem[] };
      setItems(data.items ?? []);
    }
    router.refresh();
  }

  const iso = (v: string) => (v ? new Date(v).toISOString() : null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setMsg({ kind: 'err', text: '标题不能为空' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/admin/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        summary: form.summary,
        body: form.body,
        cover: form.cover,
        reward: form.reward,
        startsAt: iso(form.startsAt),
        endsAt: iso(form.endsAt),
        status: form.status,
        sort: Number(form.sort) || 0,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '创建失败' });
      return;
    }
    setForm(EMPTY);
    setMsg({ kind: 'ok', text: '活动已创建' });
    void reload();
  }

  async function setStatus(item: EventItem, status: EventStatus) {
    const res = await fetch(`/api/v1/admin/events/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (res?.ok) void reload();
    else setMsg({ kind: 'err', text: '状态修改失败' });
  }

  async function remove(item: EventItem) {
    if (!confirm(`删除活动「${item.title}」？报名记录会一起删掉。`)) return;
    const res = await fetch(`/api/v1/admin/events/${item.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) void reload();
    else setMsg({ kind: 'err', text: '删除失败' });
  }

  return (
    <div className="col-main">
      <div className="adm-head">
        <div>
          <h1 className="page-title">活动</h1>
          <p className="adm-sub">
            草稿只有管理员可见；设为「进行中」后前台才能参加。时间留空表示待定。
          </p>
        </div>
      </div>

      {msg && <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`}>{msg.text}</p>}

      <div className="admin-split">
        <form className="card card-pad" onSubmit={create}>
          <h3 style={{ fontSize: 15 }}>新建活动</h3>
          <div className="gacha-form" style={{ marginTop: 10 }}>
            <label className="field gacha-form-wide">
              <span>标题</span>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={40}
                placeholder="例如：开学季建筑大赛"
              />
            </label>
            <label className="field gacha-form-wide">
              <span>一句话摘要</span>
              <input
                className="input"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                maxLength={120}
              />
            </label>
            <label className="field">
              <span>开始时间</span>
              <input
                className="input"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label className="field">
              <span>结束时间</span>
              <input
                className="input"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </label>
            <label className="field">
              <span>奖励说明</span>
              <input
                className="input"
                value={form.reward}
                onChange={(e) => setForm({ ...form, reward: e.target.value })}
                placeholder="例如：前 10 名 500 积分"
                maxLength={60}
              />
            </label>
            <label className="field">
              <span>状态</span>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}
              >
                <option value="draft">草稿</option>
                <option value="open">进行中</option>
                <option value="ended">已结束</option>
              </select>
            </label>
            <div className="gacha-form-wide">
              <AdminImagePicker
                value={form.cover}
                onChange={(url) => setForm({ ...form, cover: url })}
                label="封面（可空）"
                hint="PNG / JPEG / WebP / GIF，不超过 2 MB；列表与详情页顶部展示。"
              />
            </div>
            <label className="field gacha-form-wide">
              <span>正文（支持 Markdown）</span>
              <textarea
                className="input"
                style={{ height: 120, padding: 10, lineHeight: 1.7, resize: 'vertical' }}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="活动规则、参与方式、发奖时间…"
              />
            </label>
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy} style={{ marginTop: 12 }}>
            {busy ? '提交中…' : '创建活动'}
          </button>
        </form>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="console-card-head">
            <div>
              <h3 className="console-h3">活动列表</h3>
              <p className="small muted">报名人数实时统计。</p>
            </div>
            <span className="badge badge-ghost">{items.length} 个</span>
          </div>
          <div className="ev-admin-list">
            {items.length === 0 && <p className="small muted" style={{ padding: '4px 16px 14px' }}>还没有活动。</p>}
            {items.map((item) => (
              <div key={item.id} className="ev-admin-row">
                <div className="ev-admin-main">
                  <b>{item.title}</b>
                  <span className="small muted">
                    {EVENT_STATUS_LABEL[item.status]} · {fmtEventRange(item.startsAt, item.endsAt)} ·{' '}
                    {item.entryCount} 人
                  </span>
                </div>
                <select
                  className="input"
                  style={{ width: 96, height: 28, fontSize: 11.5 }}
                  value={item.status}
                  onChange={(e) => void setStatus(item, e.target.value as EventStatus)}
                >
                  <option value="draft">草稿</option>
                  <option value="open">进行中</option>
                  <option value="ended">已结束</option>
                </select>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void remove(item)}>
                  删
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
