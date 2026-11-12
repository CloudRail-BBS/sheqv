'use client';

import { useState } from 'react';

/**
 * 资源卡上的封面图。
 *
 * 封面可能是外部图床（Modrinth / CurseForge / rtsbox / 地图站），有的站会挡防盗链，
 * 破了就整块撤掉，露出底层「游戏配色 + 网格」的占位，而不是留一个碎图标。
 */
export function CoverImage({
  src,
  className = 'res-cover-img',
}: {
  src: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
