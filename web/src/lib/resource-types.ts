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

export const RESOURCE_CATEGORIES = [
  '地图',
  '整合包',
  '材质',
  '光影',
  '存档',
  '插件',
  '工具',
  '其他',
] as const;

export const RESOURCE_LICENSES = ['作者保留', 'MIT', 'CC BY-NC', 'GPL-3.0'] as const;

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
