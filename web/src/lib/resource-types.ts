/**
 * 资源库的纯类型与展示常量。
 *
 * 这个文件不 import 任何服务端模块，客户端组件可以直接引用。
 */

/** 资源下的一个文件（详情接口下发） */
export interface ResourceFile {
  /** 附件 id，下载接口用它定位 */
  id: string;
  fileId: string;
  name: string;
  size: number;
  downloads: number;
  url: string;
}

export interface ResourceView {
  id: string;
  title: string;
  summary: string;
  /** 详情才有正文 */
  body?: string;
  game: string;
  category: string;
  tags: string[];
  authorId: string;
  author: string;
  authorDeveloper: boolean;
  teamId?: string;
  teamName?: string;
  teamTag?: string;
  url: string;
  version: string;
  license: string;
  sizeBytes: number;
  /** 支持的版本，逗号分隔 */
  gameVersions: string;
  /** 加载器 / 运行环境 */
  loaders: string;
  /** 前置依赖说明 */
  deps: string;
  /** 原帖或百科链接 */
  sourceUrl: string;
  /** 外部来源站：curseforge / modrinth / rtsbox；空串表示本站资源 */
  source: string;
  /** 来源站里的项目标识 */
  sourceId: string;
  /** 来源站的项目类型（mods / modpacks …） */
  sourceKind: string;
  /** 附件数量；列表与详情都带 */
  fileCount: number;
  /** 附件明细；只有详情有 */
  files?: ResourceFile[];
  likeCount: number;
  downloadCount: number;
  liked: boolean;
  status: string;
  /** 驳回原因（仅 rejected） */
  rejectReason?: string;
  /** 审核时间（毫秒） */
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export const RESOURCE_GAMES = [
  { key: 'minecraft', label: 'Minecraft', short: 'MC' },
  { key: 'rusted_warfare', label: 'Rusted Warfare', short: 'RW' },
] as const;

export const RESOURCE_LICENSES = ['作者保留', 'MIT', 'CC BY-NC', 'GPL-3.0'] as const;

/**
 * 外部来源站。
 *
 * 库里只存「站点 + 项目标识 + 类型」，链接由这里拼，服务端 `resources::source_url()`
 * 是同一套规则 —— 两边必须一致，改这里就要改那里。
 */
export interface ResourceSourceDef {
  key: string;
  label: string;
  /** 这个站点支持哪些游戏 */
  games: string[];
  /** 是否存在「项目类型」这一段路径 */
  hasKind: boolean;
  /** 粘贴框里的示例，直接给用户照着抄 */
  example: string;
}

export const RESOURCE_SOURCES: ResourceSourceDef[] = [
  {
    key: 'curseforge',
    label: 'CurseForge',
    games: ['minecraft'],
    hasKind: true,
    example: 'https://www.curseforge.com/minecraft/mc-mods/jei',
  },
  {
    key: 'modrinth',
    label: 'Modrinth',
    games: ['minecraft'],
    hasKind: true,
    example: 'https://modrinth.com/mod/sodium',
  },
  {
    key: 'rtsbox',
    label: 'rtsbox',
    games: ['rusted_warfare'],
    hasKind: false,
    example: 'https://www.rtsbox.cn/11149-2',
  },
];

/** CurseForge / Modrinth 的路径段；与后端 `SOURCE_KINDS` 对齐 */
export const SOURCE_KINDS = [
  { key: 'mods', label: '模组' },
  { key: 'modpacks', label: '整合包' },
  { key: 'resourcepacks', label: '资源包' },
  { key: 'shaderpacks', label: '光影' },
  { key: 'datapacks', label: '数据包' },
  { key: 'worlds', label: '地图 / 存档' },
] as const;

export function sourcesForGame(game: string): ResourceSourceDef[] {
  return RESOURCE_SOURCES.filter((s) => s.games.includes(game));
}

export function sourceLabel(key: string): string {
  return RESOURCE_SOURCES.find((s) => s.key === key)?.label ?? '';
}

/** 与后端 `resources::source_url()` 同一套拼接规则 */
export function sourceUrlFor(source: string, kind: string, id: string): string {
  const sid = (id || '').trim().replace(/^\/+|\/+$/g, '');
  if (!source || !sid) return '';
  const k = (kind || '').trim() || 'mods';
  if (source === 'curseforge') return `https://www.curseforge.com/minecraft/${k}/${sid}`;
  if (source === 'modrinth') return `https://modrinth.com/${k}/${sid}`;
  if (source === 'rtsbox') return `https://www.rtsbox.cn/${sid}`;
  return '';
}

/** 允许直接粘贴整条链接：取最后一段当项目标识（与后端 normalize_source_id 一致） */
export function parseSourceRef(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const noQuery = value.split(/[?#]/)[0];
  if (/^https?:\/\//i.test(noQuery)) {
    const parts = noQuery.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] ?? '';
  }
  return noQuery.replace(/^\/+|\/+$/g, '');
}

export function gameLabel(key: string): string {
  return RESOURCE_GAMES.find((g) => g.key === key)?.label ?? key;
}

export function gameShort(key: string): string {
  return RESOURCE_GAMES.find((g) => g.key === key)?.short ?? '?';
}

export function gameTone(key: string): string {
  if (key === 'minecraft') return 'mc';
  if (key === 'roblox') return 'rbx';
  return 'rw';
}

export const DEV_SCORE_HINT = '开发者积分 = 下载量 + 点赞数 × 3';

export function fmtNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** 文件大小：0 表示作者没填 */
export function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '未标注';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
