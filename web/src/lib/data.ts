export type GameKey = 'mc' | 'rw';

export const GAME_LABEL: Record<GameKey, string> = { mc: 'Minecraft', rw: 'Roblox' };

export interface ResourceItem {
  id: string;
  title: string;
  game: GameKey;
  category: string;
  tags: string[];
  author: string;
  authorGuild: string;
  downloads: number;
  rating: number;
  sizeBytes: number;
  version: string;
  updatedAt: string;
  summary: string;
  license: 'CC BY-NC' | 'MIT' | '作者保留' | 'GPL-3.0';
  versions: { version: string; date: string; note: string }[];
}

export const RESOURCES: ResourceItem[] = [
  {
    id: 'sky-citadel',
    title: '天空之城 · 浮空岛生存地图',
    game: 'mc',
    category: '地图',
    tags: ['生存', '建筑', '1.21'],
    author: '风蚀',
    authorGuild: '星轨',
    downloads: 128400,
    rating: 4.8,
    sizeBytes: 386 * 1024 * 1024,
    version: 'v2.1.0',
    updatedAt: '2026-10-12',
    summary:
      '12 座浮空岛组成的生存世界，含自定义地形生成、可交互空艇与三层地下遗迹。适配 1.21.x，支持多人服务器直接导入。',
    license: 'CC BY-NC',
    versions: [
      { version: 'v2.1.0', date: '2026-10-12', note: '修复空艇区块加载异常；新增 2 座岛屿' },
      { version: 'v2.0.3', date: '2026-09-02', note: '适配 1.21.1，重做遗迹战利品表' },
      { version: 'v1.9.0', date: '2026-06-18', note: '首个公开版本' },
    ],
  },
  {
    id: 'create-industry',
    title: '机械动力工业整合包 v3.4',
    game: 'mc',
    category: '整合包',
    tags: ['科技', '自动化', 'Forge'],
    author: '铆钉',
    authorGuild: '铁砧',
    downloads: 96420,
    rating: 4.7,
    sizeBytes: 1.6 * 1024 * 1024 * 1024,
    version: 'v3.4.2',
    updatedAt: '2026-10-08',
    summary:
      '以 Create 为核心的轻量工业整合，142 个模组，含任务书与服务器端优化配置。开箱即用的多人协作流水线。',
    license: '作者保留',
    versions: [
      { version: 'v3.4.2', date: '2026-10-08', note: '移除冲突模组；任务书补全第七章' },
      { version: 'v3.4.0', date: '2026-09-21', note: '升级 Create 6.0' },
    ],
  },
  {
    id: 'minimal-pvp',
    title: '极简战斗材质包 128x',
    game: 'mc',
    category: '材质',
    tags: ['PvP', '低配友好'],
    author: '灰羽',
    authorGuild: '霜落',
    downloads: 213900,
    rating: 4.9,
    sizeBytes: 24 * 1024 * 1024,
    version: 'v5.0',
    updatedAt: '2026-09-28',
    summary: '为 PvP 优化：低对比度方块、清晰准星、缩短的剑与药水粒子，128x 分辨率下依然保持 200+ FPS。',
    license: 'CC BY-NC',
    versions: [{ version: 'v5.0', date: '2026-09-28', note: '重做准星与击中反馈' }],
  },
  {
    id: 'cataclysm-night',
    title: '灾变之夜 · 四人合作闯关',
    game: 'rw',
    category: '地图',
    tags: ['合作', 'PVE', '4人'],
    author: '潮汐',
    authorGuild: '潮汐',
    downloads: 54210,
    rating: 4.6,
    sizeBytes: 92 * 1024 * 1024,
    version: 'v1.6',
    updatedAt: '2026-10-01',
    summary: '四段式关卡，含动态难度与存档点。建议 4 人组队，单局 35 分钟，支持中途加入。',
    license: '作者保留',
    versions: [{ version: 'v1.6', date: '2026-10-01', note: '平衡第三关 BOSS 血量' }],
  },
  {
    id: 'redstone-starter',
    title: '红石自动化入门存档',
    game: 'mc',
    category: '存档',
    tags: ['教学', '红石'],
    author: '长夜',
    authorGuild: '长夜',
    downloads: 31870,
    rating: 4.5,
    sizeBytes: 8 * 1024 * 1024,
    version: 'v1.0',
    updatedAt: '2026-08-19',
    summary: '12 个可拆解的红石装置，每个都带说明牌与信号取点，适合新手照着复刻。',
    license: 'MIT',
    versions: [{ version: 'v1.0', date: '2026-08-19', note: '首发' }],
  },
  {
    id: 'server-monitor',
    title: '服务器性能监控面板',
    game: 'mc',
    category: '工具',
    tags: ['运维', 'Paper', '插件'],
    author: '玄武',
    authorGuild: '玄武',
    downloads: 7730,
    rating: 4.4,
    sizeBytes: 12 * 1024 * 1024,
    version: 'v0.9.4',
    updatedAt: '2026-10-14',
    summary: 'Paper 插件，输出 TPS / MSPT / 区块实体热力图，支持导出 Prometheus 指标。',
    license: 'GPL-3.0',
    versions: [{ version: 'v0.9.4', date: '2026-10-14', note: '修正热力图采样偏移' }],
  },
];

export type MatchStatus = 'pending_accept' | 'locked' | 'live' | 'submitted' | 'disputed' | 'confirmed';

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  pending_accept: '待接受',
  locked: '名单已锁定',
  live: '进行中',
  submitted: '待确认',
  disputed: '争议中',
  confirmed: '已确认',
};

export interface TimelineEvent {
  at: string;
  title: string;
  detail: string;
  actor: string;
  state: 'done' | 'active' | 'waiting';
}

export interface MatchItem {
  id: string;
  title: string;
  game: GameKey;
  format: string;
  status: MatchStatus;
  guildA: { name: string; tag: string; score?: number; submitted?: boolean };
  guildB: { name: string; tag: string; score?: number; submitted?: boolean };
  scheduledAt: string;
  maps: string[];
  rosterLockedAt?: string;
  deadline: string;
  rounds?: { map: string; scoreA: number; scoreB: number }[];
  timeline: TimelineEvent[];
}

export const MATCHES: MatchItem[] = [
  {
    id: 'm-2041',
    title: '星轨 vs 玄武 · 公会战 BO3',
    game: 'mc',
    format: 'BO3 / 占领模式',
    status: 'submitted',
    guildA: { name: '星轨', tag: 'SG', score: 2, submitted: true },
    guildB: { name: '玄武', tag: 'XW', score: 1, submitted: true },
    scheduledAt: '2026-10-18 20:00',
    maps: ['浮空岛 · 东境', '熔炉峡谷', '雪原哨站'],
    rosterLockedAt: '2026-10-18 19:30',
    deadline: '确认窗口还剩 6 小时',
    rounds: [
      { map: '浮空岛 · 东境', scoreA: 3, scoreB: 1 },
      { map: '熔炉峡谷', scoreA: 1, scoreB: 3 },
      { map: '雪原哨站', scoreA: 3, scoreB: 2 },
    ],
    timeline: [
      { at: '10-16 21:04', title: '发起约战', detail: 'BO3 / 占领模式 / 三张地图已确认', actor: '星轨 · 队长 风蚀', state: 'done' },
      { at: '10-16 21:40', title: '对方接受', detail: '玄武接受约战并提交初版名单', actor: '玄武 · 队长 岩层', state: 'done' },
      { at: '10-18 19:30', title: '名单锁定', detail: '双方 5 人名单快照落库，哈希 7f3a…c21', actor: '系统', state: 'done' },
      { at: '10-18 20:00', title: '比赛开始', detail: '三局两胜，服务器 由星轨 提供', actor: '系统', state: 'done' },
      { at: '10-18 22:12', title: '双方提交结果', detail: '比分一致 2:1，等待确认', actor: '双方队长', state: 'active' },
      { at: '—', title: '确认后锁定', detail: '一致或仲裁裁定后计入战绩', actor: '待定', state: 'waiting' },
    ],
  },
  {
    id: 'm-2038',
    title: '铁砧 vs 霜落 · 战队赛 BO5',
    game: 'mc',
    format: 'BO5 / 破坏模式',
    status: 'disputed',
    guildA: { name: '铁砧', tag: 'AS', score: 2, submitted: true },
    guildB: { name: '霜落', tag: 'FR', score: 2, submitted: true },
    scheduledAt: '2026-10-17 21:00',
    maps: ['峡谷', '遗迹', '港口', '雪原', '终局'],
    rosterLockedAt: '2026-10-17 20:30',
    deadline: '举证窗口 10-20 23:59 截止',
    timeline: [
      { at: '10-15 18:20', title: '发起约战', detail: 'BO5 / 破坏模式', actor: '铁砧 · 队长 铆钉', state: 'done' },
      { at: '10-15 19:02', title: '对方接受', detail: '霜落接受约战', actor: '霜落 · 队长 灰羽', state: 'done' },
      { at: '10-17 20:30', title: '名单锁定', detail: '双方 6 人名单快照落库', actor: '系统', state: 'done' },
      { at: '10-17 23:41', title: '提交结果不一致', detail: '铁砧 3:2 / 霜落 2:3，自动进入争议', actor: '系统', state: 'active' },
      { at: '—', title: '双方举证', detail: '第 5 局录像 + 截图，须在窗口内提交', actor: '待定', state: 'waiting' },
      { at: '—', title: '仲裁裁定', detail: '仅管理后台可操作，三端前台无入口', actor: '赛事组', state: 'waiting' },
    ],
  },
  {
    id: 'm-2044',
    title: '长夜 vs 银松 · 友谊赛 BO1',
    game: 'rw',
    format: 'BO1 / 竞速',
    status: 'locked',
    guildA: { name: '长夜', tag: 'NY' },
    guildB: { name: '银松', tag: 'YS' },
    scheduledAt: '2026-10-21 19:30',
    maps: ['灾变之夜 · 第一段'],
    rosterLockedAt: '2026-10-20 12:00',
    deadline: '10-21 19:30 开赛',
    timeline: [
      { at: '10-19 14:11', title: '发起约战', detail: 'BO1 / 竞速 / 单地图', actor: '长夜 · 队长 烛', state: 'done' },
      { at: '10-19 15:20', title: '对方接受', detail: '银松接受约战', actor: '银松 · 队长 白桦', state: 'done' },
      { at: '10-20 12:00', title: '名单锁定', detail: '名单已锁定，比赛前不可变更', actor: '系统', state: 'active' },
      { at: '—', title: '比赛开始', detail: '等待 10-21 19:30', actor: '待定', state: 'waiting' },
    ],
  },
  {
    id: 'm-2033',
    title: '潮汐 vs 熔岩 · 公会战 BO3',
    game: 'mc',
    format: 'BO3 / 占领模式',
    status: 'confirmed',
    guildA: { name: '潮汐', tag: 'CX', score: 3, submitted: true },
    guildB: { name: '熔岩', tag: 'RY', score: 0, submitted: true },
    scheduledAt: '2026-10-11 20:00',
    maps: ['港口', '峡谷', '遗迹'],
    rosterLockedAt: '2026-10-11 19:30',
    deadline: '已于 10-12 09:20 确认',
    timeline: [
      { at: '10-09 20:00', title: '发起约战', detail: 'BO3 / 占领模式', actor: '潮汐 · 队长 礁', state: 'done' },
      { at: '10-09 20:31', title: '对方接受', detail: '熔岩接受约战', actor: '熔岩 · 队长 赤', state: 'done' },
      { at: '10-11 19:30', title: '名单锁定', detail: '双方名单快照落库', actor: '系统', state: 'done' },
      { at: '10-11 22:40', title: '双方提交一致', detail: '3:0 自动确认', actor: '系统', state: 'done' },
      { at: '10-12 09:20', title: '计入战绩', detail: '仅确认结果进入排名与积分', actor: '系统', state: 'done' },
    ],
  },
];

export interface GuildItem {
  tag: string;
  name: string;
  members: number;
  power: number;
  winRate: number;
  intro: string;
}

export const GUILDS: GuildItem[] = [
  { tag: 'SG', name: '星轨', members: 48, power: 9420, winRate: 0.72, intro: '主打占领模式，晚 8 点固定训练，缺一名指挥。' },
  { tag: 'XW', name: '玄武', members: 52, power: 9180, winRate: 0.68, intro: '老牌防守型公会，擅长熔炉峡谷。' },
  { tag: 'AS', name: '铁砧', members: 39, power: 8760, winRate: 0.64, intro: '工程流公会，机械动力整合包的作者团队。' },
];

export interface TeamItem {
  id: string;
  name: string;
  tag: string;
  guild: string;
  game: GameKey;
  members: number;
  roster: string[];
  wins: number;
  losses: number;
  winRate: number;
  intro: string;
  status: '训练中' | '招募中' | '休赛';
}

export const TEAMS: TeamItem[] = [
  {
    id: 't-sg-a',
    name: '星轨一队',
    tag: 'SG1',
    guild: '星轨',
    game: 'mc',
    members: 5,
    roster: ['风蚀', '砾', '青禾', '迟', '南'],
    wins: 24,
    losses: 7,
    winRate: 0.77,
    intro: '公会的首发阵容，主打占领与资源压制，周中训练两次。',
    status: '训练中',
  },
  {
    id: 't-sg-b',
    name: '星轨青训',
    tag: 'SG2',
    guild: '星轨',
    game: 'mc',
    members: 6,
    roster: ['雨', '石', '半山', '沐', '舟'],
    wins: 9,
    losses: 11,
    winRate: 0.45,
    intro: '新人练兵队，以赛代练，接受友谊赛约战。',
    status: '招募中',
  },
  {
    id: 't-xw-a',
    name: '玄武主队',
    tag: 'XW1',
    guild: '玄武',
    game: 'mc',
    members: 6,
    roster: ['岩层', '磐', '北坡', '守拙', '砚', '垛'],
    wins: 31,
    losses: 12,
    winRate: 0.72,
    intro: '防守反击体系，擅长把比赛拖进第三局。',
    status: '训练中',
  },
  {
    id: 't-ny-a',
    name: '长夜竞速',
    tag: 'NY1',
    guild: '长夜',
    game: 'rw',
    members: 4,
    roster: ['烛', '影', '榆', '泠'],
    wins: 12,
    losses: 5,
    winRate: 0.71,
    intro: 'RW 竞速专项队，第一段路线打磨了三版。',
    status: '休赛',
  },
];

export interface PlayerItem {
  id: string;
  name: string;
  guild: string;
  team: string;
  matches: number;
  wins: number;
  rate: number;
  points: number;
  trend: 'up' | 'down' | 'flat';
}

export const PLAYERS: PlayerItem[] = [
  { id: 'p1', name: '岩层', guild: '玄武', team: '玄武主队', matches: 43, wins: 31, rate: 0.72, points: 86, trend: 'up' },
  { id: 'p2', name: '风蚀', guild: '星轨', team: '星轨一队', matches: 31, wins: 24, rate: 0.77, points: 72, trend: 'up' },
  { id: 'p3', name: '铆钉', guild: '铁砧', team: '铁砧工程', matches: 38, wins: 24, rate: 0.63, points: 68, trend: 'down' },
  { id: 'p4', name: '烛', guild: '长夜', team: '长夜竞速', matches: 17, wins: 12, rate: 0.71, points: 36, trend: 'up' },
  { id: 'p5', name: '磐', guild: '玄武', team: '玄武主队', matches: 29, wins: 19, rate: 0.66, points: 55, trend: 'flat' },
  { id: 'p6', name: '砾', guild: '星轨', team: '星轨一队', matches: 26, wins: 18, rate: 0.69, points: 51, trend: 'up' },
  { id: 'p7', name: '灰羽', guild: '霜落', team: '霜落先锋', matches: 22, wins: 14, rate: 0.64, points: 41, trend: 'down' },
  { id: 'p8', name: '白桦', guild: '银松', team: '银松一队', matches: 19, wins: 11, rate: 0.58, points: 33, trend: 'flat' },
];

export interface FeedItem {
  id: string;
  author: string;
  guild: string;
  time: string;
  title?: string;
  body: string;
  tags: string[];
  likes: number;
  comments: number;
  pinned?: boolean;
  kind?: 'post' | 'match' | 'resource';
}

export const FEED: FeedItem[] = [
];
// 种子帖子已清空：社区从零开始，内容全部来自真实注册用户。
// 资源 / 公会 / 战队 / 约战仍是产品结构演示数据（后台尚无对应管理界面）。

export interface Announcement {
  id: string;
  title: string;
  kind: '规则' | '版本' | '活动' | '系统';
  date: string;
  body: string;
  views: number;
  pinned?: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'a1',
    title: '约战规则 v3：确认窗口改为 24 小时',
    kind: '规则',
    date: '10-19',
    body:
      '双方提交结果后 24 小时内未确认，系统按一致结果自动确认；不一致则自动进入争议，举证期 72 小时。名单外人员参赛一律判定违约，记信誉事件一次。',
    views: 12480,
    pinned: true,
  },
  {
    id: 'a2',
    title: '天空之城 v2.1 上线，新增两座浮空岛',
    kind: '版本',
    date: '10-18',
    body: '修复空艇区块加载异常，遗迹战利品表重做。老存档建议重新生成世界，v2.0 存档可继续使用但不会出现新岛屿。',
    views: 8620,
  },
  {
    id: 'a3',
    title: 'S3 赛季公会战报名开启',
    kind: '活动',
    date: '10-17',
    body: '报名截止 10-25，需公会等级 ≥ 5 且至少有 1 支已完成名单快照的战队。赛程于 10-26 公布。',
    views: 6410,
  },
  {
    id: 'a4',
    title: '名单快照与替补规则说明',
    kind: '规则',
    date: '10-15',
    body: '比赛前 30 分钟锁定快照，锁定后只读。替补可替换首发，但必须在快照名单内；锁定后变更需双方队长确认并生成新版本。',
    views: 4180,
  },
  {
    id: 'a5',
    title: '微信内下载与唤起 App 的说明',
    kind: '系统',
    date: '10-13',
    body: '微信内置浏览器不支持直接下载文件，也不支持用 Universal Links 唤起 App。请在右上角选择「在浏览器打开」，或直接安装 App。',
    views: 3960,
  },
  {
    id: 'a6',
    title: '冬季地图征集：主题「极夜」',
    kind: '活动',
    date: '10-11',
    body: '征集期 10-11 至 11-10，入选作品进入官方推荐位并获得 500 贡献积分。投稿请走资源库「地图」分类并勾选活动标签。',
    views: 2740,
  },
];
