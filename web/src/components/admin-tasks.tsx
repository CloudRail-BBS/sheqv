'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TASK_KIND_LABEL,
  TASK_METRIC_LABEL,
  type TaskKind,
  type TaskMetric,
} from '@/lib/task-types';

interface AdminTask {
  id: string;
  title: string;
  description: string;
  kind: TaskKind;
  metric: TaskMetric;
  target: number;
  rewardPoints: number;
  sort: number;
  enabled: boolean;
}

const EMPTY = {
  id: '',
  title: '',
  description: '',
  kind: 'daily' as TaskKind,
  metric: 'checkin' as TaskMetric,
  target: 1,
  rewardPoints: 10,
  sort: 0,
  enabled: true,
};

const METRICS = Object.keys(TASK_METRIC_LABEL) as TaskMetric[];
const KINDS = Object.keys(TASK_KIND_LABEL) as TaskKind[];

export function AdminTasks() {
  const [items, setItems] = useState<AdminTask[]>([]);
  const [form, setForm] = useState<AdminTask>(EMPTY as AdminTask);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/tasks', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取失败（需要管理员权限）' });
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: AdminTask[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof AdminTask>(key: K, value: AdminTask[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const editing = Boolean(form.id);
    const res = await fetch(
      editing ? `/api/v1/admin/tasks/${form.id}` : '/api/v1/admin/tasks',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          kind: form.kind,
          metric: form.metric,
          target: form.target,
          rewardPoints: form.rewardPoints,
          sort: form.sort,
          enabled: form.enabled,
        }),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: editing ? '已保存' : '已创建' });
    setForm(EMPTY as AdminTask);
    void load();
  }

  async function toggle(task: AdminTask) {
    setBusy(true);
    const res = await fetch(`/api/v1/admin/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !task.enabled }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '操作失败' });
      return;
    }
    void load();
  }

  async function remove(task: AdminTask) {
    if (!window.confirm(`删除任务「${task.title}」？已领取的记录也会一并删除。`)) return;
    setBusy(true);
    const res = await fetch(`/api/v1/admin/tasks/${task.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败' });
      return;
    }
    if (form.id === task.id) setForm(EMPTY as AdminTask);
    void load();
  }

  return (
    <>
      <div className="card card-pad">
        <div className="between" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 13.5 }}>{form.id ? '编辑任务' : '新建任务'}</b>
          {form.id && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm(EMPTY as AdminTask)}>
              取消编辑
            </button>
          )}
        </div>

        <div className="adm-grid2">
          <label className="field">
            <span>标题</span>
            <input
              className="input"
              value={form.title}
              maxLength={30}
              placeholder="例如：每日签到"
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <label className="field">
            <span>奖励积分</span>
            <input
              className="input"
              value={String(form.rewardPoints)}
              inputMode="numeric"
              onChange={(e) => set('rewardPoints', Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
          </label>
          <label className="field">
            <span>周期</span>
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value as TaskKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>统计指标</span>
            <select className="input" value={form.metric} onChange={(e) => set('metric', e.target.value as TaskMetric)}>
              {METRICS.map((m) => (
                <option key={m} value={m}>{TASK_METRIC_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>目标次数</span>
            <input
              className="input"
              value={String(form.target)}
              inputMode="numeric"
              onChange={(e) => set('target', Number(e.target.value.replace(/\D/g, '')) || 1)}
            />
          </label>
          <label className="field">
            <span>排序（小的在前）</span>
            <input
              className="input"
              value={String(form.sort)}
              inputMode="numeric"
              onChange={(e) => set('sort', Number(e.target.value.replace(/[^\d-]/g, '')) || 0)}
            />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>说明（可空）</span>
            <input
              className="input"
              value={form.description}
              maxLength={200}
              placeholder="一句话说明怎么完成"
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </div>

        {msg && (
          <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`} style={{ marginTop: 8 }}>
            {msg.text}
          </p>
        )}

        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || form.title.trim().length < 2}>
            {busy ? '保存中…' : form.id ? '保存修改' : '创建任务'}
          </button>
          <span className="small muted">禁用的任务不会出现在任务中心。</span>
        </div>
      </div>

      {loading ? (
        <p className="small muted" style={{ marginTop: 12 }}>读取中…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state" style={{ marginTop: 12 }}>
          <b>还没有任务</b>
          <p>上面的表单发布第一条后，用户就能在 /tasks 看到。</p>
        </div>
      ) : (
        <div className="card table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>标题</th>
                <th>周期</th>
                <th>指标</th>
                <th>目标</th>
                <th>奖励</th>
                <th>状态</th>
                <th style={{ width: 168 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    {t.description && <div className="small muted">{t.description}</div>}
                  </td>
                  <td className="small">{TASK_KIND_LABEL[t.kind]}</td>
                  <td className="small">{TASK_METRIC_LABEL[t.metric]}</td>
                  <td className="mono small">{t.target}</td>
                  <td className="mono small">+{t.rewardPoints}</td>
                  <td>
                    <span className={'badge ' + (t.enabled ? 'badge-live' : 'badge-ghost')}>
                      {t.enabled ? '启用' : '停用'}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => setForm(t)}>
                        编辑
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => toggle(t)} disabled={busy}>
                        {t.enabled ? '停用' : '启用'}
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost adm-mini" onClick={() => remove(t)} disabled={busy}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
