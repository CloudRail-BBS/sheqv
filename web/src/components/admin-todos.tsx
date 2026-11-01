'use client';

import { useState } from 'react';
import type { AdminTodo, TodoPriority, TodoStats } from '@/lib/admin-todos';

/**
 * 后台待办清单。
 *
 * 都在本地先改再发请求（乐观更新）：勾一下、删一条、加一条都不该等一次往返，
 * 失败时回滚并把原因写在卡片底部。
 * 服务端在每次写操作后回一份 stats，所以「逾期 / 今天完成」不用前端自己算。
 */

const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 };
const PRIORITY_LABEL: Record<TodoPriority, string> = { high: '高', normal: '普通', low: '低' };

function sortItems(list: AdminTodo[]): AdminTodo[] {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
    if (a.status === 'open') {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
    }
    return b.createdAt - a.createdAt;
  });
}

/** 本地时区的 YYYY-MM-DD，和 `<input type="date">` 的取值一致 */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY = 86_400_000;

/** 截止日 → 「今天 / 明天 / 逾期 3 天 / 11月8日」 */
function dueLabel(due: string): { text: string; late: boolean; soon: boolean } {
  const today = localDay(new Date());
  if (due === today) return { text: '今天到期', late: false, soon: true };
  const diff = Math.round(
    (new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / DAY,
  );
  if (diff === 1) return { text: '明天到期', late: false, soon: true };
  if (diff < 0) return { text: `逾期 ${-diff} 天`, late: true, soon: false };
  const [, m, d] = due.split('-');
  return { text: `${Number(m)} 月 ${Number(d)} 日`, late: false, soon: false };
}

export function AdminTodos({ initial, stats: initialStats }: { initial: AdminTodo[]; stats: TodoStats }) {
  const [items, setItems] = useState(() => sortItems(initial));
  const [stats, setStats] = useState(initialStats);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('normal');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  /** 正在改哪一条的截止日（点日期就地变成 date 输入） */
  const [dateEdit, setDateEdit] = useState<string | null>(null);

  const open = items.filter((t) => t.status === 'open');
  const done = items.filter((t) => t.status === 'done');

  async function send(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    if (!res) return { ok: false as const, message: '请求没有发出去，检查网络后重试' };
    const data = (await res.json().catch(() => ({}))) as {
      item?: AdminTodo;
      stats?: TodoStats;
      message?: string;
    };
    if (!res.ok) return { ok: false as const, message: data.message ?? `操作失败（HTTP ${res.status}）` };
    if (data.stats) setStats(data.stats);
    return { ok: true as const, item: data.item };
  }

  async function add() {
    const text = title.trim();
    if (!text) {
      setErr('先写一句要做什么');
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await send('POST', '/api/v1/admin/todos', {
      title: text,
      priority,
      dueDate: due || null,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    if (r.item) setItems((prev) => sortItems([r.item as AdminTodo, ...prev]));
    setTitle('');
    setDue('');
    setPriority('normal');
  }

  /** 改优先级 / 改截止日：先本地改，失败回滚 */
  async function patchTodo(t: AdminTodo, body: Record<string, unknown>) {
    setErr(null);
    setItems((prev) => sortItems(prev.map((i) => (i.id === t.id ? { ...i, ...body } : i))));
    const r = await send('PATCH', `/api/v1/admin/todos/${t.id}`, body);
    if (!r.ok) {
      setItems((prev) => sortItems(prev.map((i) => (i.id === t.id ? t : i))));
      setErr(r.message);
    }
  }

  async function cyclePriority(t: AdminTodo) {
    const next: TodoPriority = t.priority === 'high' ? 'normal' : t.priority === 'normal' ? 'low' : 'high';
    await patchTodo(t, { priority: next });
  }

  async function toggle(t: AdminTodo) {
    const next = t.status === 'open' ? 'done' : 'open';
    setErr(null);
    setItems((prev) =>
      sortItems(
        prev.map((i) =>
          i.id === t.id
            ? { ...i, status: next, doneAt: next === 'done' ? Date.now() : null }
            : i,
        ),
      ),
    );
    const r = await send('PATCH', `/api/v1/admin/todos/${t.id}`, { status: next });
    if (!r.ok) {
      setItems((prev) => sortItems(prev.map((i) => (i.id === t.id ? t : i))));
      setErr(r.message);
    }
  }

  async function remove(t: AdminTodo) {
    setErr(null);
    setItems((prev) => prev.filter((i) => i.id !== t.id));
    const r = await send('DELETE', `/api/v1/admin/todos/${t.id}`);
    if (!r.ok) {
      setItems((prev) => sortItems([...prev, t]));
      setErr(r.message);
    }
  }

  return (
    <section className="card todo-card" id="todo" aria-label="后台待办">
      <header className="todo-head">
        <div>
          <h3>待办</h3>
          <p className="todo-sub">
            {open.length > 0 ? `${open.length} 项未完成` : '清单已清空'}
            {stats.overdue > 0 && <span className="todo-overdue">· {stats.overdue} 项逾期</span>}
          </p>
        </div>
        <span className="todo-today">今天完成 {stats.doneToday}</span>
      </header>

      <div className="todo-add">
        <input
          className="todo-input"
          value={title}
          placeholder="记一件要做的事，回车添加"
          aria-label="待办内容"
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void add();
            }
          }}
        />
        <select
          className="todo-prio"
          value={priority}
          aria-label="优先级"
          onChange={(e) => setPriority(e.target.value as TodoPriority)}
        >
          {(['high', 'normal', 'low'] as TodoPriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <input
          className="todo-date"
          type="date"
          value={due}
          aria-label="截止日期"
          onChange={(e) => setDue(e.target.value)}
        />
        <button type="button" className="btn btn-sm btn-primary todo-add-btn" disabled={busy} onClick={() => void add()}>
          添加
        </button>
      </div>

      {err && <p className="todo-err">{err}</p>}

      {open.length === 0 ? (
        <p className="todo-empty">没有待办。想到什么随手记一条，勾掉就消失。</p>
      ) : (
        <ul className="todo-list">
          {open.map((t) => {
            const d = t.dueDate ? dueLabel(t.dueDate) : null;
            return (
              <li key={t.id} className="todo-item" data-priority={t.priority}>
                <button
                  type="button"
                  className="todo-check"
                  aria-label={`标记「${t.title}」为已完成`}
                  onClick={() => void toggle(t)}
                />
                <div className="todo-body">
                  <span className="todo-title">{t.title}</span>
                  <span className="todo-meta">
                    <button
                      type="button"
                      className="todo-prio-chip"
                      data-p={t.priority}
                      title="点击切换优先级"
                      onClick={() => void cyclePriority(t)}
                    >
                      {PRIORITY_LABEL[t.priority]}
                    </button>
                    {dateEdit === t.id ? (
                      <input
                        className="todo-date-inline"
                        type="date"
                        autoFocus
                        defaultValue={t.dueDate ?? ''}
                        aria-label="截止日期"
                        onBlur={() => setDateEdit(null)}
                        onChange={(e) => {
                          setDateEdit(null);
                          void patchTodo(t, { dueDate: e.target.value || null });
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="todo-due"
                        data-late={d?.late ?? false}
                        data-soon={d?.soon ?? false}
                        title="点击修改截止日"
                        onClick={() => setDateEdit(t.id)}
                      >
                        {d ? d.text : '设截止日'}
                      </button>
                    )}
                    {t.note && <span className="todo-note">{t.note}</span>}
                    {t.creator && <span className="todo-by">{t.creator}</span>}
                  </span>
                </div>
                <button
                  type="button"
                  className="todo-del"
                  aria-label={`删除「${t.title}」`}
                  onClick={() => void remove(t)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <div className="todo-done">
          <button type="button" className="todo-done-toggle" onClick={() => setShowDone((v) => !v)}>
            <span>已完成 {done.length}</span>
            <span>{showDone ? '收起' : '展开'}</span>
          </button>
          {showDone && (
            <ul className="todo-list">
              {done.map((t) => (
                <li key={t.id} className="todo-item" data-priority="done" data-done="true">
                  <button
                    type="button"
                    className="todo-check"
                    aria-label={`把「${t.title}」恢复为未完成`}
                    data-checked="true"
                    onClick={() => void toggle(t)}
                  />
                  <div className="todo-body">
                    <span className="todo-title">{t.title}</span>
                    <span className="todo-meta">
                      {t.doneAt && (
                        <span className="todo-by">
                          {new Date(t.doneAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 完成
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="todo-del"
                    aria-label={`删除「${t.title}」`}
                    onClick={() => void remove(t)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
