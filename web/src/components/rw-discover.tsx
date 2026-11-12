'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RwMapCard, type RwMapItem } from './rw-map-card';

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

export function RwCells({ q }: { q?: string }) {
  const router = useRouter();
  const [mods, setMods] = useState<RwMod[]>([]);
  const [maps, setMaps] = useState<RwMapItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (keyword: string) => {
    const params = new URLSearchParams({ limit: '8' });
    if (keyword.trim()) params.set('q', keyword.trim());
    const res = await fetch(`/api/v1/rw/discover?${params}`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; mods?: RwMod[]; maps?: RwMapItem[] }
      | null;
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

  if (mods.length === 0 && maps.length === 0) {
    return msg ? <p className="small res-cells-msg">{msg}</p> : null;
  }

  return (
    <>
      {maps.map((m) => (
        <RwMapCard
          key={`map-${m.id}`}
          item={{
            ...m,
            downloadUrl: m.hasDownload === false ? undefined : `/api/v1/rw/maps/${m.id}/download`,
            siteUrl: `https://maps.rw.nebulapause.com/?nameKey=${encodeURIComponent(m.name)}`,
          }}
        />
      ))}

      {mods.map((mod) => (
        <button
          key={`mod-${mod.sourceId}`}
          type="button"
          className="card res-card res-card-btn"
          disabled={busy === mod.sourceId}
          title={`点一下把「${mod.title}」收入资源库`}
          onClick={() => void collect(mod)}
        >
          <span className={'res-cover cover-rw' + (mod.icon ? ' has-img' : '')}>
            {mod.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="res-cover-img" src={mod.icon} alt="" loading="lazy" decoding="async" />
            )}
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
      {mods.length === 0 && !(q ?? '').trim() && maps.length > 0 && (
        <p className="small muted res-cells-note">
          输入关键词（比如「模组」「战役」）还能搜到 rtsbox 上的铁锈战争模组
        </p>
      )}

      {msg && <p className="small res-cells-msg">{msg}</p>}
    </>
  );
}
