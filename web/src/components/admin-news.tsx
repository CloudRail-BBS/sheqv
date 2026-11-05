'use client';

import { useCallback, useEffect, useState } from 'react';

interface Article {
  id: string;
  columnId: string | null;
  columnName: string | null;
  title: string;
  summary: string;
  body: string;
  cover: string;
  author: string;
  source: string;
  published: boolean;
  publishedAt: number;
}

interface Column {
  id: string;
  name: string;
  slug: string;
  intro: string;
  sort: number;
  count: number;
}

const EMPTY_ARTICLE = {
  columnId: '',
  title: '',
  summary: '',
  body: '',
  cover: '',
  author: '',
  source: '',
  published: false,
};
type ArticleDraft = typeof EMPTY_ARTICLE;

const EMPTY_COLUMN = { name: '', slug: '', intro: '', sort: 100 };
type ColumnDraft = typeof EMPTY_COLUMN;

const day = (ts: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts));

export function AdminNews() {
  const [tab, setTab] = useState<'articles' | 'columns'>('articles');
  const [items, setItems] = useState<Article[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [colDraft, setColDraft] = useState<ColumnDraft | null>(null);
  const [colEditing, setColEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([
      fetch('/api/v1/admin/news', { cache: 'no-store' }).catch(() => null),
      fetch('/api/v1/admin/news/columns', { cache: 'no-store' }).catch(() => null),
    ]);
    if (!a?.ok || !c?.ok) {
      setMsg({ ok: false, text: '读取失败（需要管理员权限）' });
      return;
    }
    setItems(((await a.json()) as { items: Article[] }).items ?? []);
    setColumns(((await c.json()) as { items: Column[] }).items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveArticle() {
    if (!draft || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      editing ? `/api/v1/admin/news/${editing}` : '/api/v1/admin/news',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ ok: true, text: editing ? '已保存' : '已创建' });
    setDraft(null);
    setEditing(null);
    void load();
  }

  async function togglePublish(a: Article) {
    const res = await fetch(`/api/v1/admin/news/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ published: !a.published }),
    }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '操作失败' });
      return;
    }
    void load();
  }

  async function removeArticle(id: string) {
    if (!window.confirm('删除这篇稿件？')) return;
    const res = await fetch(`/api/v1/admin/news/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '删除失败' });
      return;
    }
    if (editing === id) {
      setEditing(null);
      setDraft(null);
    }
    void load();
  }

  async function saveColumn() {
    if (!colDraft || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      colEditing ? `/api/v1/admin/news/columns/${colEditing}` : '/api/v1/admin/news/columns',
      {
        method: colEditing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...colDraft, sort: Number(colDraft.sort) || 0 }),
      },
    ).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      setMsg({ ok: false, text: data?.message ?? '保存失败' });
      return;
    }
    setMsg({ ok: true, text: colEditing ? '栏目已更新' : '栏目已创建' });
    setColDraft(null);
    setColEditing(null);
    void load();
  }

  async function removeColumn(c: Column) {
    if (!window.confirm(`删除栏目「${c.name}」？栏目下的 ${c.count} 篇稿件会变成「未归档」，不会删除。`))
      return;
    const res = await fetch(`/api/v1/admin/news/columns/${c.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ ok: false, text: '删除失败' });
      return;
    }
    void load();
  }

  return (
    <>
      <div className="between" style={{ marginBottom: 10 }}>
        <div className="seg">
          <button type="button" data-on={tab === 'articles'} onClick={() => setTab('articles')}>
            稿件 {items.length}
          </button>
          <button type="button" data-on={tab === 'columns'} onClick={() => setTab('columns')}>
            栏目 {columns.length}
          </button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn btn-sm btn-ghost" href="/news/paper" target="_blank" rel="noreferrer">
            预览报刊
          </a>
          {tab === 'articles' ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setEditing(null);
                setDraft({ ...EMPTY_ARTICLE, columnId: columns[0]?.id ?? '' });
                setMsg(null);
              }}
            >
              新建稿件
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setColEditing(null);
                setColDraft({ ...EMPTY_COLUMN, sort: (columns.at(-1)?.sort ?? 0) + 10 });
                setMsg(null);
              }}
            >
              新建栏目
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p className="small" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', marginBottom: 8 }}>
          {msg.text}
        </p>
      )}

      {tab === 'articles' && draft && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <b>{editing ? '编辑稿件' : '新建稿件'}</b>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(null)}>
              取消
            </button>
          </div>

          <div className="adm-form" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>标题（2–80 字）</span>
              <input
                className="input"
                value={draft.title}
                maxLength={80}
                placeholder="一句话说清这则新闻"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>栏目</span>
              <select
                className="input"
                value={draft.columnId}
                onChange={(e) => setDraft({ ...draft, columnId: e.target.value })}
              >
                <option value="">未归档</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>记者署名</span>
              <input
                className="input"
                value={draft.author}
                maxLength={40}
                placeholder="社区编辑部"
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </label>
            <label className="field">
              <span>来源（可空）</span>
              <input
                className="input"
                value={draft.source}
                maxLength={60}
                placeholder="玩家投稿 / 赛事组委会"
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              />
            </label>
            <label className="field">
              <span>封面图地址（可空）</span>
              <input
                className="input"
                value={draft.cover}
                maxLength={500}
                placeholder="https://… 或 /api/v1/media/…"
                onChange={(e) => setDraft({ ...draft, cover: e.target.value })}
              />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>导语（≤200 字，列表和报刊开头会用到）</span>
              <textarea
                className="input textarea"
                rows={2}
                maxLength={200}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>正文（空行分段）</span>
              <textarea
                className="input textarea"
                rows={10}
                maxLength={20000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <span>状态</span>
              <label className="check" style={{ height: 34 }}>
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                />
                <span>立即发布</span>
              </label>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={saveArticle}
              disabled={busy || draft.title.trim().length < 2}
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {tab === 'articles' &&
        (items.length === 0 ? (
          <div className="card empty-state">
            <b>还没有新闻</b>
            <p>点右上角「新建稿件」写第一篇。</p>
          </div>
        ) : (
          <div className="ticket-list">
            {items.map((a) => (
              <div key={a.id} className="card card-pad">
                <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <b style={{ fontSize: 13 }}>{a.title}</b>
                      <span className={'badge ' + (a.published ? 'badge-ok' : 'badge-ghost')}>
                        {a.published ? '已发布' : '草稿'}
                      </span>
                      <span className="badge badge-ghost">{a.columnName ?? '未归档'}</span>
                      <span className="small muted mono">{day(a.publishedAt)}</span>
                    </div>
                    {a.summary && (
                      <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                        {a.summary}
                      </p>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6, flex: 'none' }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => togglePublish(a)}>
                      {a.published ? '转草稿' : '发布'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setEditing(a.id);
                        setDraft({
                          columnId: a.columnId ?? '',
                          title: a.title,
                          summary: a.summary,
                          body: a.body,
                          cover: a.cover,
                          author: a.author,
                          source: a.source,
                          published: a.published,
                        });
                        setMsg(null);
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => removeArticle(a.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'columns' && (
        <>
          {colDraft && (
            <div className="card card-pad" style={{ marginBottom: 12 }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <b>{colEditing ? '编辑栏目' : '新建栏目'}</b>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setColDraft(null)}>
                  取消
                </button>
              </div>
              <div className="adm-form" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <label className="field">
                  <span>栏目名（1–12 字）</span>
                  <input
                    className="input"
                    value={colDraft.name}
                    maxLength={12}
                    placeholder="要闻"
                    onChange={(e) => setColDraft({ ...colDraft, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>英文别名（可空，用于链接）</span>
                  <input
                    className="input mono"
                    value={colDraft.slug}
                    maxLength={30}
                    placeholder="top"
                    onChange={(e) => setColDraft({ ...colDraft, slug: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>排序（小的在前，报刊版面也按它排）</span>
                  <input
                    className="input mono"
                    type="number"
                    value={colDraft.sort}
                    onChange={(e) => setColDraft({ ...colDraft, sort: Number(e.target.value) })}
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>栏目说明（可空）</span>
                  <textarea
                    className="input textarea"
                    rows={2}
                    maxLength={200}
                    value={colDraft.intro}
                    onChange={(e) => setColDraft({ ...colDraft, intro: e.target.value })}
                  />
                </label>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={saveColumn}
                  disabled={busy || colDraft.name.trim().length === 0}
                >
                  {busy ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          )}

          <div className="ticket-list">
            {columns.map((c) => (
              <div key={c.id} className="card card-pad">
                <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <b style={{ fontSize: 13 }}>{c.name}</b>
                      <span className="small muted mono">#{c.sort}</span>
                      <span className="badge badge-ghost">{c.count} 篇</span>
                      <span className="small muted mono">/{c.slug}</span>
                    </div>
                    {c.intro && (
                      <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
                        {c.intro}
                      </p>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6, flex: 'none' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setColEditing(c.id);
                        setColDraft({ name: c.name, slug: c.slug, intro: c.intro, sort: c.sort });
                        setMsg(null);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => removeColumn(c)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
