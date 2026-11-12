'use client';

import { useState } from 'react';

/**
 * 铁锈战争地图卡（参考 RELAY-CN 地图库的卡型）。
 *
 * 和普通资源卡不一样：地图要能「先看再下」——缩略图铺满上半，下面是地图名、
 * 作者与上传时间、赞/踩与总下载、属性标签（PVP / 尺寸 / 矿点…），底部两个动作
 * 「查看大图」+「下载地图 / 收录到资源库」。所以单独一套 `.rwmap-*`，不硬套 `.res-card`。
 */

export interface RwMapItem {
  /** 地图唯一 id（原站 mapId） */
  id: string;
  name: string;
  author: string;
  /** 缩略图（列表用） */
  thumb: string;
  /** 原图（点「查看大图」） */
  image: string;
  downloads: number;
  likes: number;
  dislikes: number;
  /** 属性标签：PVP、尺寸 15000x40000、矿点 925 … */
  tags: string[];
  /** 上传时间（毫秒），拿不到就是 0 */
  uploadedAt?: number;
  /** 下载地址（本站转发或原站直链）；没有就给个不可下载的提示 */
  downloadUrl?: string;
  /** 原站是否提供下载 */
  hasDownload?: boolean;
  /** 原站页面（下载失灵时的兜底入口） */
  siteUrl?: string;
}

const fmt = (n: number) =>
  n >= 100000000
    ? `${(n / 100000000).toFixed(1)} 亿`
    : n >= 10000
      ? `${(n / 10000).toFixed(1)} 万`
      : n.toLocaleString('zh-CN');

const fmtDate = (ts?: number) => (ts && ts > 0 ? new Date(ts).toISOString().slice(0, 10) : '');

export function RwMapCard({
  item,
  onCollect,
  busy = false,
}: {
  item: RwMapItem;
  /** 没有直链时，点「收录到资源库」交给上层 */
  onCollect?: (item: RwMapItem) => void;
  busy?: boolean;
}) {
  const thumb = item.thumb || item.image;
  // 地图站的图偶尔 404 或被防盗链挡掉：破了就退回占位，别留一个碎图标
  const [thumbBroken, setThumbBroken] = useState(false);
  const showThumb = Boolean(thumb) && !thumbBroken;

  return (
    <article className="card rwmap">
      <a
        className="rwmap-thumb"
        href={item.image || thumb || '#'}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`查看 ${item.name} 大图`}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={`${item.name} 缩略图`}
            loading="lazy"
            decoding="async"
            onError={() => setThumbBroken(true)}
          />
        ) : (
          <span className="rwmap-thumb-empty" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path
                d="M3 17.5 8.4 9l3.6 5.4 2.6-3.6L21 17.5M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <em>暂无预览图</em>
          </span>
        )}
      </a>

      <div className="rwmap-body">
        <div className="rwmap-name" title={item.name}>{item.name}</div>

        <div className="rwmap-meta">
          <span>作者 {item.author || '未知'}</span>
          {item.uploadedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{fmtDate(item.uploadedAt)}</span>
            </>
          ) : null}
        </div>

        <div className="rwmap-stats">
          <span className="rwmap-stat" title="赞">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path
                d="M7 11v9H4.5A1.5 1.5 0 0 1 3 18.5v-6A1.5 1.5 0 0 1 4.5 11H7Zm0 0 4.2-7.4A1.6 1.6 0 0 1 14 4.4V9h4.6a2 2 0 0 1 2 2.4l-1.3 6.6a2 2 0 0 1-2 1.6H7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {fmt(item.likes)}
          </span>
          <span className="rwmap-stat" title="踩">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path
                d="M17 13V4h2.5A1.5 1.5 0 0 1 21 5.5v6a1.5 1.5 0 0 1-1.5 1.5H17Zm0 0-4.2 7.4A1.6 1.6 0 0 0 10 19.6V15H5.4a2 2 0 0 1-2-2.4l1.3-6.6a2 2 0 0 1 2-1.6H17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {fmt(item.dislikes)}
          </span>
          <span className="rwmap-dl-count">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path
                d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            总下载 {fmt(item.downloads)}
          </span>
        </div>

        {item.tags.length > 0 && (
          <div className="rwmap-tags">
            {item.tags.slice(0, 4).map((t) => (
              <span key={t} className="rwmap-tag">{t}</span>
            ))}
          </div>
        )}

        <div className="rwmap-actions">
          {item.image && (
            <a className="rwmap-link" href={item.image} target="_blank" rel="noreferrer noopener">
              查看大图
            </a>
          )}
          {item.siteUrl && (
            <a className="rwmap-link" href={item.siteUrl} target="_blank" rel="noreferrer noopener">
              地图站
            </a>
          )}
          <button
            type="button"
            className="rwmap-cta"
            disabled={busy || !item.downloadUrl}
            onClick={() => {
              if (item.downloadUrl) {
                window.open(item.downloadUrl, '_blank', 'noopener');
                return;
              }
              onCollect?.(item);
            }}
          >
            {busy ? '处理中…' : item.downloadUrl ? '下载地图' : '暂无下载'}
          </button>
        </div>
      </div>
    </article>
  );
}
