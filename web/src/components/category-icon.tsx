import type { ReactNode } from 'react';

/**
 * 分类胶囊的图标与色相。
 *
 * 参考资源广场那种「彩色胶囊」：每个分类有自己的色相，未选中是浅底同色字，
 * 选中切成实色深底白字；图标跟着 currentColor 走，不需要两套图标。
 *
 * 色相按分类 key 固定分配（key 是后台维护的，改名不影响配色）；
 * 没有登记的 key 落到中性灰，不会出现「彩虹乱跳」。
 */
const HUE: Record<string, number> = {
  地图: 32,
  模组: 145,
  整合包: 335,
  材质: 265,
  光影: 318,
  数据包: 190,
  存档: 170,
  插件: 272,
  工具: 42,
};

export function catHue(key: string): number | undefined {
  return HUE[key];
}

/** 游戏的色相与图标：和分类胶囊同一套视觉，Minecraft 绿、Rusted Warfare 蓝 */
const GAME_HUE_MAP: Record<string, number> = {
  minecraft: 145,
  rusted_warfare: 205,
};

export function gameHue(key: string): number | undefined {
  return GAME_HUE_MAP[key];
}

const ICONS: Record<string, ReactNode> = {
  地图: (
    <>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7z" />
      <path d="M9 4v13M15 7v12.5" />
    </>
  ),
  模组: (
    <>
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </>
  ),
  整合包: (
    <>
      <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z" />
      <path d="m4 7.2 8 4.2 8-4.2M12 11.4V21" />
    </>
  ),
  材质: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1.6a1.9 1.9 0 0 0 1.4-3.2 1.9 1.9 0 0 1 1.4-3.2H18a3.4 3.4 0 0 0 3.4-3.4C21.4 6.5 17.2 3 12 3Z" />
      <circle cx="8.4" cy="9.6" r="1.2" />
      <circle cx="12.6" cy="7.4" r="1.2" />
      <circle cx="7.6" cy="14.2" r="1.2" />
    </>
  ),
  光影: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  数据包: (
    <>
      <ellipse cx="12" cy="6.4" rx="7" ry="2.8" />
      <path d="M5 6.4v11.2c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V6.4M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8" />
    </>
  ),
  存档: (
    <>
      <path d="M4 7a2 2 0 0 1 2-2h4l2 2.4h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </>
  ),
  插件: (
    <>
      <path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5zM12 16v5" />
    </>
  ),
  工具: (
    <>
      <path d="M14.2 3.2a5 5 0 0 0-4.5 7L3 17v4h4l6.8-6.7a5 5 0 1 0 .4-11.1Z" />
    </>
  ),
  全部: (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </>
  ),
  minecraft: (
    <>
      <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z" />
      <path d="m4 7.2 8 4.2 8-4.2M12 11.4V21" />
      <path d="M8 6.1v4.2M16 6.1v4.2" />
    </>
  ),
  rusted_warfare: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" />
    </>
  ),
};

/** 分类图标：统一 1.6 描边、currentColor，跟着胶囊文字色走 */
export function CategoryIcon({ name, size = 18 }: { name: string; size?: number }) {
  const body = ICONS[name] ?? ICONS.全部;
  return (
    <svg
      className="chip-ico"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  );
}
