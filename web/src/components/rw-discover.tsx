'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RwMapCard, type RwMapItem } from './rw-map-card';
import { CoverImage } from './cover-image';

/**
 * 铁锈战争的外部条目：rtsbox 的模组 + RELAY-CN 地图站的地图。
 *
 * 卡片直接落进资源库的同一个 `.res-grid`，不单独开板块：
 * - 地图用 `RwMapCard`（缩略图 + 赞踩 + 总下载 + 属性标签），只在「地图」分类下出现；
 * - 模组复用普通资源卡，只在「模组」分类（或不选分类）下出现，点卡片收录进资源库。
 *
 * 分页：底部的「加载更多」按 rtsbox 的 page 往后翻，地图没有关键词时是随机批次，
 * 靠 id 去重；某一页没带回新条目就收掉按钮。
 */

interface RwMod {
  title: string;
  url: string;
  sourceUrl: string;
  icon: string;
  sourceId: string;
}

const PAGE_LIMIT = 8;
/** 最多翻这么多页，避免随机批次一直点下去 */
const MAX_PAGES = 5;

export function RwCells({ q, category }: { q?: string; category?: string }) {
  const router = useRouter();
  const [mods, setMods] = useState<RwMod[]>([]);
  const [maps, setMaps] = useState<RwMapItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /** 首次拉取铺骨架，别让这一格空着 */
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  /** 用 ref 记「当前是哪次请求」，避免快速切关键词时旧响应盖掉新结果 */
  const seq = useRef(0);
  /** 追加时要拿「最新的完整列表」，state 在回调里是旧的，所以另存一份 ref */
  const modsRef = useRef<RwMod[]>([]);
  const mapsRef = useRef<RwMapItem[]>([]);

  const load = useCallback(async (keyword: string, nextPage: number, append: boolean) => {
    const ticket = ++seq.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), page: String(nextPage) });
    if (keyword.trim()) params.set('q', keyword.trim());
    const res = await fetch(`/api/v1/rw/discover?${params}`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; mods?: RwMod[]; maps?: RwMapItem[] }
      | null;
    if (ticket !== seq.current) return; // 已经有更新的请求了

    const nextMods = data?.ok ? (data.mods ?? []) : [];
    const nextMaps = data?.ok ? (data.maps ?? []) : [];

    if (!append) {
      modsRef.current = nextMods;
      mapsRef.current = nextMaps;
      setLoading(false);
      setMods(nextMods);
      setMaps(nextMaps);
      setPage(nextPage);
      setHasMore(nextPage < MAX_PAGES && (nextMods.length > 0 || nextMaps.length > 0));
      return;
    }

    setLoadingMore(false);
    // 追加：按 id 去重（随机批次会重复），一条新条目都没有就说明没有下一页了
    const seenMods = new Set(modsRef.current.map((m) => m.sourceId));
    const freshMods = nextMods.filter((m) => !seenMods.has(m.sourceId));
    const seenMaps = new Set(mapsRef.current.map((m) => m.id));
    const freshMaps = nextMaps.filter((m) => !seenMaps.has(m.id));

    if (freshMods.length > 0) {
      modsRef.current = [...modsRef.current, ...freshMods];
      setMods(modsRef.current);
    }
    if (freshMaps.length > 0) {
      mapsRef.current = [...mapsRef.current, ...freshMaps];
      setMaps(mapsRef.current);
    }
    setPage(nextPage);
    setHasMore(freshMods.length + freshMaps.length > 0 && nextPage < MAX_PAGES);
  }, []);

  useEffect(() => {
    void load(q ?? '', 1, false);
  }, [q, load]);

  async function collect(mod: RwMod) {
    setBusy(mod.sourceId);
    setMsg(null);
    const res = await fetch('/api/v1/resources/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'rtsbox',
        sourceId: mod.sourceId,
        title: mod.title,
        summary: '',
        author: '',
        icon: mod.icon,
        downloads: 0,
        url: mod.url,
        sourceUrl: mod.sourceUrl,
        // 落库时按「模组」分类：远程源的分类由后台那张表决定，这里只决定 kind
        kind: 'mods',
        projectId: 0,
      }),
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

  // 「地图」板块只要地图，「模组」板块只要模组，不选分类时两样都露
  const showMaps = !category || category === '地图';
  const showMods = !category || category === '模组';
  const visibleMaps = showMaps ? maps : [];
  const visibleMods = showMods ? mods : [];

  if (loading && mods.length === 0 && maps.length === 0) {
    return (
      <>
        {showMaps && [0, 1, 2].map((i) => (
          <div key={`sk-map-${i}`} className="card rwmap rwmap-skeleton" aria-hidden="true">
            <span className="rwmap-thumb sk" />
            <div className="rwmap-body">
              <span className="sk sk-line" style={{ width: '76%' }} />
              <span className="sk sk-line" style={{ width: '44%' }} />
              <span className="sk sk-line" style={{ width: '58%' }} />
              <span className="sk sk-line sk-line--short" style={{ width: '36%' }} />
            </div>
          </div>
        ))}
        {showMods && [0, 1].map((i) => (
          <div key={`sk-mod-${i}`} className="card res-card rwmap-skeleton" aria-hidden="true">
            <span className="res-cover sk" />
            <span className="res-body">
              <span className="sk sk-line" style={{ width: '68%' }} />
              <span className="sk sk-line" style={{ width: '52%' }} />
              <span className="sk sk-line sk-line--short" style={{ width: '30%' }} />
            </span>
          </div>
        ))}
        <p className="small muted res-cells-note">
          {showMaps && !showMods
            ? '正在从地图站取数据…'
            : showMods && !showMaps
              ? '正在从 rtsbox 取数据…'
              : '正在从 rtsbox 与地图站取数据…'}
        </p>
      </>
    );
  }

  if (visibleMaps.length === 0 && visibleMods.length === 0) {
    return msg ? <p className="small res-cells-msg">{msg}</p> : null;
  }

  return (
    <>
      {visibleMaps.map((m) => (
        <RwMapCard
          key={`map-${m.id}`}
          item={{
            ...m,
            downloadUrl: m.hasDownload === false ? undefined : `/api/v1/rw/maps/${m.id}/download`,
            siteUrl: `https://maps.rw.nebulapause.com/?nameKey=${encodeURIComponent(m.name)}`,
          }}
        />
      ))}

      {visibleMods.map((mod) => (
        <button
          key={`mod-${mod.sourceId}`}
          type="button"
          className="card res-card res-card-btn"
          disabled={busy === mod.sourceId}
          title={`点一下把「${mod.title}」收入资源库`}
          onClick={() => void collect(mod)}
        >
          <span className={'res-cover cover-rw' + (mod.icon ? ' has-img' : '')}>
            <CoverImage src={mod.icon} />
            <span className="badge badge-rw res-cover-tag">Rusted Warfare</span>
            <span className="ver">模组</span>
          </span>
          <span className="res-body">
            <span className="res-title">{mod.title}</span>
            <span className="res-chips">
              <span className="res-chip res-chip-src">rtsbox</span>
              <span className="res-chip">模组</span>
            </span>
            <span className="res-foot">
              <span className="res-foot-ver">
                {busy === mod.sourceId ? '正在收录…' : '点卡片收录'}
              </span>
              <span className="res-foot-dl mono">rtsbox</span>
            </span>
          </span>
        </button>
      ))}

      {hasMore && (
        <div className="res-cells-more">
          <button
            type="button"
            className="btn btn-sm btn-ghost res-more-btn"
            disabled={loadingMore}
            onClick={() => void load(q ?? '', page + 1, true)}
          >
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}

      {msg && <p className="small res-cells-msg">{msg}</p>}
    </>
  );
}
