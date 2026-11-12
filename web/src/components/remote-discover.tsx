'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  resourcepacks: '材质',
  shaderpacks: '光影',
  datapacks: '数据包',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? '模组';

/** 本站分类 → Modrinth 的项目类型：分类选了哪个板块，就只拉那一类 */
const CATEGORY_KIND: Record<string, string> = {
  模组: 'mods',
  整合包: 'modpacks',
  材质: 'resourcepacks',
  光影: 'shaderpacks',
  数据包: 'datapacks',
};

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
  canImport,
}: {
  /** 资源库搜索词：有词就按词搜，没词就取热门 */
  q?: string;
  /** 当前游戏筛选 */
  game?: string;
  /** 当前分类筛选：只有「模组」板块收外部模组，别的分类不混进来 */
  category?: string;
  /** 能不能收录进资源库：只有管理员可以，其他人点卡片去原站 */
  canImport?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<RemoteItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /** 拉取失败的原因（网络、限流、镜像挂了），别静默清空 */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  /** 快速切关键词时，旧响应不能盖掉新结果 */
  const seq = useRef(0);
  /** 追加要拿「最新的完整列表」，回调里的 state 是旧的 */
  const itemsRef = useRef<RemoteItem[]>([]);

  // 分类对应 Modrinth 的项目类型：模组 / 整合包 / 材质 / 光影 / 数据包各自只拉自己那一类；
  // 不选分类时全类型混排。别的分类（地图、存档、工具…）不混入外部条目。
  const categoryKind = category ? CATEGORY_KIND[category] : undefined;
  const enabled = (!game || game === 'minecraft') && (!category || Boolean(categoryKind));

  const load = useCallback(async (keyword: string, nextOffset: number, append: boolean) => {
    const ticket = ++seq.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    const pageSize = keyword.trim() ? 12 : 6;
    const params = new URLSearchParams({
      source: 'modrinth',
      limit: String(pageSize),
      offset: String(nextOffset),
    });
    if (categoryKind) params.set('kind', categoryKind);
    if (keyword.trim()) params.set('q', keyword.trim());
    const res = await fetch(`/api/v1/resources/discover?${params}`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; items?: RemoteItem[]; message?: string }
      | null;
    if (ticket !== seq.current) return; // 已经有更新的请求了

    const next = data?.ok ? (data.items ?? []).filter((i) => i.source === 'modrinth') : [];
    setLoadError(data?.ok ? null : (data?.message ?? '拉取失败，稍后再试'));

    if (!append) {
      itemsRef.current = next;
      setLoading(false);
      setItems(next);
      setOffset(nextOffset);
      // 返回条数不足一页，说明后面没有了
      setHasMore(next.length >= pageSize && nextOffset + pageSize < 900);
      return;
    }

    setLoadingMore(false);
    const seen = new Set(itemsRef.current.map((i) => `${i.source}-${i.sourceId}`));
    const fresh = next.filter((i) => !seen.has(`${i.source}-${i.sourceId}`));
    if (fresh.length > 0) {
      itemsRef.current = [...itemsRef.current, ...fresh];
      setItems(itemsRef.current);
    }
    setOffset(nextOffset);
    setHasMore(fresh.length > 0 && next.length >= pageSize);
  }, [categoryKind]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    void load(q ?? '', 0, false);
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

  // 首屏骨架：两张卡的量，形状和真卡一致
  if (loading && items.length === 0) {
    return (
      <>
        {[0, 1].map((i) => (
          <div key={`sk-src-${i}`} className="card res-card rwmap-skeleton" aria-hidden="true">
            <span className="res-cover sk" />
            <span className="res-body">
              <span className="sk sk-line" style={{ width: '70%' }} />
              <span className="sk sk-line" style={{ width: '54%' }} />
              <span className="sk sk-line sk-line--short" style={{ width: '32%' }} />
            </span>
          </div>
        ))}
        <p className="small muted res-cells-note">正在从 Modrinth 取数据…</p>
      </>
    );
  }

  return (
    <>
      {items.map((item) => {
        const key = `${item.source}-${item.sourceId}`;
        const body = (
          <>
            <span className={'res-cover cover-mc' + (item.icon ? ' has-img' : '')}>
              <CoverImage src={item.icon} />
              <span className="badge badge-mc res-cover-tag">Minecraft</span>
              <span className="res-cover-side">
                <span className="ver">{kindLabel(item.kind)}</span>
              </span>
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
                  {canImport
                    ? busy === item.sourceId
                      ? '正在收录…'
                      : '点卡片收录'
                    : '查看详情'}
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
          </>
        );

        // 不能收录的人：点卡片进站内的预览详情页（介绍、版本、来源都在那儿），不是直接跳外站
        if (!canImport) {
          const pid = item.projectId ? `?pid=${item.projectId}` : '';
          return (
            <Link
              key={key}
              className="card res-card res-card-btn"
              href={`/resources/remote/${item.source}/${encodeURIComponent(item.sourceId)}${pid}`}
              title={`查看「${item.title}」详情`}
            >
              {body}
            </Link>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className="card res-card res-card-btn"
            disabled={busy === item.sourceId}
            title={`点一下把「${item.title}」收入资源库`}
            onClick={() => void collect(item)}
          >
            {body}
          </button>
        );
      })}
      {hasMore && (
        <div className="res-cells-more">
          <button
            type="button"
            className="btn btn-sm btn-ghost res-more-btn"
            disabled={loadingMore}
            onClick={() =>
              void load(q ?? '', offset + ((q ?? '').trim() ? 12 : 6), true)
            }
          >
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}

      {msg && <p className="small res-cells-msg">{msg}</p>}
      {!msg && items.length === 0 && loadError && (
        <p className="small res-cells-msg">Modrinth：{loadError}</p>
      )}
    </>
  );
}
