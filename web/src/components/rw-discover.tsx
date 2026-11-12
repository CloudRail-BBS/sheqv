'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RwMapCard, type RwMapItem } from './rw-map-card';
import { CoverImage } from './cover-image';

/**
 * 铁锈战争的外部条目：rtsbox 的模组 + RELAY-CN 地图站的地图。
 *
 * 和 Minecraft 那套一样，卡片直接落进资源库的同一个 `.res-grid`，不单独开板块：
 * - 地图用 `RwMapCard`（缩略图 + 赞踩 + 总下载 + 属性标签），「下载地图」走本站转发；
 * - 模组复用普通资源卡，点卡片收录进资源库（rtsbox 的接口必须带关键词，
 *   没关键词时这一栏不出现，只留地图）。
 */

interface RwMod {
  title: string;
  url: string;
  sourceUrl: string;
  icon: string;
  sourceId: string;
}

export function RwCells({ q, category }: { q?: string; category?: string }) {
  const router = useRouter();
  const [mods, setMods] = useState<RwMod[]>([]);
  const [maps, setMaps] = useState<RwMapItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /** 首次拉取时铺骨架卡，别让这一格空着 */
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (keyword: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '8' });
    if (keyword.trim()) params.set('q', keyword.trim());
    const res = await fetch(`/api/v1/rw/discover?${params}`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; mods?: RwMod[]; maps?: RwMapItem[] }
      | null;
    setLoading(false);
    if (!data?.ok) {
      setMods([]);
      setMaps([]);
      return;
    }
    setMods(data.mods ?? []);
    setMaps(data.maps ?? []);
  }, []);

  useEffect(() => {
    void load(q ?? '');
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

  // 骨架：三张地图卡 + 两张模组卡的量，形状和真卡一致，出来时不跳版
  if (loading && mods.length === 0 && maps.length === 0) {
    return (
      <>
        {[0, 1, 2].map((i) => (
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
        {category !== '地图' && [0, 1].map((i) => (
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
          {category === '地图' ? '正在从地图站取数据…' : '正在从 rtsbox 与地图站取数据…'}
        </p>
      </>
    );
  }

  // 地图只在「地图」板块出现（不选分类时也露出来）；模组反过来，地图板块里不混模组
  const showMaps = !category || category === '地图';
  const showMods = !category || category !== '地图';
  const visibleMaps = showMaps ? maps : [];
  const visibleMods = showMods ? mods : [];

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

      {/* rtsbox 的接口必须有关键词才返回数据，没搜的时候提醒一句 */}
      {visibleMods.length === 0 && visibleMaps.length > 0 && !(q ?? '').trim() && showMods && (
        <p className="small muted res-cells-note">
          输入关键词（比如「模组」「战役」）还能搜到 rtsbox 上的铁锈战争模组
        </p>
      )}

      {msg && <p className="small res-cells-msg">{msg}</p>}
    </>
  );
}
