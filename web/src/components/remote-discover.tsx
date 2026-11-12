'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CoverImage } from './cover-image';

/**
 * 外部站点条目（Modrinth）。
 *
 * 这里**不是**一个独立板块：卡片直接落进资源库那同一个 `.res-grid`，
 * 和站内资源混排、样式完全一致。点卡片 = 收录进本站（带上介绍、加载器、
 * 支持版本、标签与封面）并跳到详情页；同一个项目只收一次，重复点直接打开已有的那条。
 *
 * 只有 Minecraft 有这两个站；分类筛选生效时不混入（远程条目没有本站分类，
 * 混进来会让筛选结果说不通）。
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
  projectId?: number;
}

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

// 下载量动辄上亿，按「亿 / 万」换挡
const fmt = (n: number) =>
  n >= 100000000
    ? `${(n / 100000000).toFixed(1)} 亿`
    : n >= 10000
      ? `${(n / 10000).toFixed(1)} 万`
      : n.toLocaleString('zh-CN');

export function RemoteCells({
  q,
  game,
  category,
}: {
  /** 资源库搜索词：有词就按词搜，没词就取热门 */
  q?: string;
  /** 当前游戏筛选 */
  game?: string;
  /** 当前分类筛选：只有「模组」板块收外部模组，别的分类不混进来 */
  category?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<RemoteItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 外部模组只在「模组」分类（或不选分类）下出现，和铁锈战争那边规则一致
  const enabled = (!game || game === 'minecraft') && (!category || category === '模组');

  const load = useCallback(async (keyword: string) => {
    const params = new URLSearchParams({
      source: 'modrinth',
      kind: 'mods',
      limit: keyword.trim() ? '12' : '6',
    });
    if (keyword.trim()) params.set('q', keyword.trim());
    const res = await fetch(`/api/v1/resources/discover?${params}`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; items?: RemoteItem[] }
      | null;
    if (!data?.ok) {
      setItems([]);
      return;
    }
    setItems((data.items ?? []).filter((i) => i.source === 'modrinth'));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    void load(q ?? '');
  }, [enabled, q, load]);

  async function collect(item: RemoteItem) {
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
      setMsg(data?.message ?? '收录失败，请先登录或稍后再试');
      return;
    }
    router.push(`/resources/${data.id}`);
    router.refresh();
  }

  if (!enabled) return null;

  return (
    <>
      {items.map((item) => (
        <button
          key={`${item.source}-${item.sourceId}`}
          type="button"
          className="card res-card res-card-btn"
          disabled={busy === item.sourceId}
          title={`点一下把「${item.title}」收入资源库`}
          onClick={() => void collect(item)}
        >
          <span className={'res-cover cover-mc' + (item.icon ? ' has-img' : '')}>
            <CoverImage src={item.icon} />
            <span className="badge badge-mc res-cover-tag">Minecraft</span>
            <span className="ver">{kindLabel(item.kind)}</span>
          </span>
          <span className="res-body">
            <span className="res-title">{item.title}</span>
            {item.summary && <span className="res-desc">{item.summary}</span>}
            <span className="res-chips">
              <span className="res-chip res-chip-src">{sourceName(item.source)}</span>
              {item.author && <span className="res-chip">{item.author}</span>}
            </span>
            <span className="res-foot">
              <span className="res-foot-ver">
                {busy === item.sourceId ? '正在收录…' : '点卡片收录'}
              </span>
              <span className="res-foot-dl mono">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path
                    d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {fmt(item.downloads)}
              </span>
            </span>
          </span>
        </button>
      ))}
      {msg && <p className="small res-cells-msg">{msg}</p>}
    </>
  );
}
