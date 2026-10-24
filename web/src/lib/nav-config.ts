/**
 * 导航注册表：侧边栏与移动端底部栏共用。
 *
 * 后台只存「key 的有序列表」（逗号分隔），前端按注册表渲染；
 * 未知 key 自动忽略，配置为空回落到默认，删掉某个功能也不会把导航打散。
 */

export type NavGroupId = 'browse' | 'sections' | 'workspace';

export interface NavItemDef {
  key: string;
  href: string;
  label: string;
  group: NavGroupId;
}

export interface NavGroupDef {
  id: NavGroupId;
  label: string;
  items: NavItemDef[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'browse',
    label: '浏览',
    items: [
      { key: 'home', href: '/', label: '首页', group: 'browse' },
      { key: 'guilds', href: '/guilds', label: '公会', group: 'browse' },
      { key: 'teams', href: '/teams', label: '战队', group: 'browse' },
      { key: 'matches', href: '/matches', label: '约战', group: 'browse' },
      { key: 'servers', href: '/servers', label: '联机大厅', group: 'browse' },
      { key: 'resources', href: '/resources', label: '资源库', group: 'browse' },
      { key: 'dev-teams', href: '/dev-teams', label: '开发团队', group: 'browse' },
      { key: 'leaderboard', href: '/leaderboard', label: '排行榜', group: 'browse' },
    ],
  },
  {
    id: 'sections',
    label: '分区',
    items: [
      { key: 'mc', href: '/resources?game=minecraft', label: 'Minecraft', group: 'sections' },
      {
        key: 'rw',
        href: '/resources?game=rusted_warfare',
        label: 'Rusted Warfare',
        group: 'sections',
      },
      { key: 'modpacks', href: '/resources?category=整合包', label: '整合包', group: 'sections' },
      { key: 'tools', href: '/resources?category=工具', label: '工具', group: 'sections' },
    ],
  },
  {
    id: 'workspace',
    label: '工作台',
    items: [
      { key: 'me', href: '/me', label: '我的', group: 'workspace' },
      { key: 'points', href: '/points', label: '积分与签到', group: 'workspace' },
      { key: 'groups', href: '/groups', label: '身份组', group: 'workspace' },
      { key: 'rewards', href: '/rewards', label: '福利中心', group: 'workspace' },
      { key: 'announcements', href: '/announcements', label: '公告', group: 'workspace' },
      { key: 'sponsors', href: '/sponsors', label: '赞助者', group: 'workspace' },
      { key: 'agreements', href: '/agreements', label: '公约', group: 'workspace' },
    ],
  },
];

export const NAV_ITEMS: NavItemDef[] = NAV_GROUPS.flatMap((g) => g.items);

const KNOWN = new Set(NAV_ITEMS.map((i) => i.key));

export const SIDEBAR_DEFAULT = NAV_ITEMS.map((i) => i.key);
export const TABBAR_DEFAULT = ['home', 'guilds', 'teams', 'matches', 'me'];
/** 底部栏最多 8 个；超过 5 个后横向滑动 */
export const TABBAR_SIZE = 8;

export function navItem(key: string): NavItemDef | undefined {
  return NAV_ITEMS.find((i) => i.key === key);
}

/** 解析逗号分隔的 key；未知项丢弃、重复项去重；为空或全无效时回落 */
export function parseNav(raw: string | undefined, fallback: string[]): string[] {
  const text = (raw ?? '').trim();
  if (!text) return [...fallback];

  const out: string[] = [];
  for (const piece of text.split(',')) {
    const key = piece.trim();
    if (KNOWN.has(key) && !out.includes(key)) out.push(key);
  }
  return out.length > 0 ? out : [...fallback];
}

export function serializeNav(keys: string[]): string {
  return keys.filter((k) => KNOWN.has(k)).slice(0, 32).join(',');
}

/** 底部栏最多 8 个；≤5 个均分，>5 个横向滚动，未知项丢弃 */
export function normalizeTabbar(raw: string | undefined): string[] {
  return parseNav(raw, TABBAR_DEFAULT).slice(0, TABBAR_SIZE);
}

export function defaultSidebar(): string[] {
  return [...SIDEBAR_DEFAULT];
}

/**
 * 导航高亮：带查询参数的分区必须参数也匹配。
 *
 * 之前只比 pathname，`/resources?game=minecraft`、`?category=整合包` 都会命中
 * `/resources`，导致点一个分区四个全亮。
 */
export function isNavActive(
  pathname: string,
  search: { get(name: string): string | null },
  href: string,
): boolean {
  const [path, query = ''] = href.split('?');

  if (path === '/') return pathname === '/' && !query;
  if (pathname !== path && !pathname.startsWith(path + '/')) return false;

  if (query) {
    const want = new URLSearchParams(query);
    for (const [key, value] of want) {
      if (search.get(key) !== value) return false;
    }
    return true;
  }

  // 资源库总入口：带 game/category 筛选时让位给具体分区
  if (path === '/resources') {
    return !search.get('game') && !search.get('category');
  }

  return true;
}
