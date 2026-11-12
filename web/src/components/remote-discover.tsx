'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 资源库「外部拉取」区块。
 *
 * 数据来自后端 `/api/v1/resources/discover`（Modrinth 免 key；CurseForge 需要后台配 key）。
 * 搜到的条目先只做展示，点「导入」才落库 —— 避免一次搜索就往库里灌几十条别人的资源。
 */

interface RemoteItem {
  source: string;
  sourceId: string;
  title: string;
  summary: string;
  author: string;
  icon: string;
  downloads: number;
  url: string;
  kind: string;
}

const SOURCES = [
  { key: 'modrinth', label: 'Modrinth' },
  { key: 'curseforge', label: 'CurseForge' },
];

const KINDS = [
  { key: 'mods', label: '模组' },
  { key: 'modpacks', label: '整合包' },
  { key: 'resourcepacks', label: '资源包' },
  { key: 'shaderpacks', label: '光影' },
];

const SOURCE_NAME: Record<string, string> = { modrinth: 'Modrinth', curseforge: 'CurseForge' };
const sourceName = (k: string) => SOURCE_NAME[k] ?? k;

const KIND_LABEL: Record<string, string> = {
  mods: '模组',
  modpacks: '整合包',
  resourcepacks: '资源包',
  shaderpacks: '光影',
  datapacks: '数据包',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? '模组';

const fmt = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN');

export function RemoteDiscover() {
  const router = useRouter();
  const [source, setSource] = useState('modrinth');
  const [kind, setKind] = useState('mods');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<RemoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(
    async (nextSource = source, nextKind = kind, keyword = q) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ source: nextSource, kind: nextKind, limit: '12' });
      if (keyword.trim()) params.set('q', keyword.trim());
      const res = await fetch(`/api/v1/resources/discover?${params}`).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | { ok?: boolean; items?: RemoteItem[]; message?: string }
        | null;
      setLoading(false);
      if (!data?.ok) {
        setItems([]);
        setError(data?.message ?? '拉取失败，稍后再试');
        return;
      }
      setItems((data.items ?? []).slice(0, 12));
      if ((data.items ?? []).length === 0) setError('没有搜到条目，换个关键词试试');
    },
    [source, kind, q],
  );

  // 进页面就按默认条件拉一次（Modrinth 热门模组），不做折叠
  useEffect(() => {
    void load('modrinth', 'mods', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importItem(item: RemoteItem) {
    setBusy(item.sourceId);
    setMsg(null);
    const res = await fetch('/api/v1/resources/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; id?: string; message?: string }
      | null;
    setBusy(null);
    if (!res?.ok || !data?.id) {
      setMsg(data?.message ?? '导入失败，请先登录或稍后再试');
      return;
    }
    router.push(`/resources/${data.id}`);
    router.refresh();
  }

  return (
    <section className="res-discover">
      <div className="res-discover-head">
        <span className="res-discover-title">
          从 Modrinth / CurseForge 拉取
          <em>点「导入」才进本站资源库</em>
        </span>
      </div>

      <div className="res-discover-body">
          <div className="res-discover-bar">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                type="button"
                className="chip"
                data-on={source === s.key}
                onClick={() => {
                  setSource(s.key);
                  void load(s.key, kind, q);
                }}
              >
                {s.label}
              </button>
            ))}
            <span className="res-discover-sep" aria-hidden="true" />
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className="chip"
                data-on={kind === k.key}
                onClick={() => {
                  setKind(k.key);
                  void load(source, k.key, q);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>

          <form
            className="res-search res-discover-search"
            onSubmit={(e) => {
              e.preventDefault();
              void load(source, kind, q);
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`在 ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'} 搜索…`}
              aria-label="搜索外部资源"
            />
            <button type="submit" className="btn btn-sm btn-ghost" disabled={loading}>
              {loading ? '搜索中…' : '搜索'}
            </button>
          </form>

          {msg && <p className="small res-discover-msg">{msg}</p>}
          {error && !loading && <p className="small muted res-discover-msg">{error}</p>}

          <div className="res-grid">
            {items.map((item) => (
              <article key={`${item.source}-${item.sourceId}`} className="card res-card">
                <a
                  className="res-cover cover-mc"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`在 ${sourceName(item.source)} 打开 ${item.title}`}
                >
                  <span className="badge badge-mc">Minecraft</span>
                  <span className="ver">{kindLabel(item.kind)}</span>
                </a>
                <div className="res-body">
                  <a
                    className="res-title"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={item.title}
                  >
                    {item.title}
                  </a>
                  <div className="res-meta">
                    <span>{sourceName(item.source)}</span>
                    <span>·</span>
                    <span className="res-author">{item.author || '未知作者'}</span>
                  </div>
                  <div className="res-foot">
                    <span className="small muted mono">↓ {fmt(item.downloads)}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy === item.sourceId}
                      onClick={() => void importItem(item)}
                    >
                      {busy === item.sourceId ? '导入中…' : '导入'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {loading && items.length === 0 && (
              <p className="small muted res-discover-msg">正在拉取…</p>
            )}
          </div>
      </div>
    </section>
  );
}
