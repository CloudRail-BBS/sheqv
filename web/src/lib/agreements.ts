/**
 * 公约 · 类型与内置数据
 * 纯数据 + 无副作用工具，客户端组件可安全 import。
 * 后台新增的公约存在 .data/agreements.json，由 agreement-store 读写。
 */

export interface Clause {
  h: string;
  p: string;
}

export interface Agreement {
  id: string;
  title: string;
  short: string;
  version: string;
  updatedAt: string;
  scope: string;
  summary: string;
  clauses: Clause[];
  /** 未签署时受限的行为 */
  gate: string;
  active: boolean;
  builtin?: boolean;
  createdAt?: string;
}

export const BUILTIN_AGREEMENTS: Agreement[] = [
  {
    id: 'trust',
    title: '诚信公约',
    short: '诚信',
    version: 'v2',
    updatedAt: '2026-10-19',
    scope: '所有发起或参与约战的玩家与战队',
    summary:
      '约战的结果由双方共同确认，社区只提供记录与仲裁。这份公约约束的是"谁在打、打成什么样、结果怎么报"。',
    clauses: [
      { h: '身份真实', p: '绑定的游戏身份必须为本人所有。代打、借号参赛、冒用他人 ID 一律判定违约。' },
      { h: '名单一致', p: '参赛人员必须与锁定快照一致。替补须在快照名单内，名单外人员上场即违约。' },
      { h: '结果如实', p: '比分与证据必须如实提交。虚报比分、篡改截图或录像，一经核实封禁 90 天。' },
      { h: '证据可信', p: '提交的录像与截图须为原始文件或可追溯外链，不得剪辑关键片段。' },
      { h: '配合仲裁', p: '进入争议后须在 72 小时内举证；拒不配合的，仲裁可作出不利裁定。' },
    ],
    gate: '未签署时不能发起约战、提交比分、确认结果或发起争议',
    active: true,
    builtin: true,
    createdAt: '2026-06-01',
  },
  {
    id: 'community',
    title: '社区公约',
    short: '社区',
    version: 'v1.2',
    updatedAt: '2026-10-15',
    scope: '所有访问社区的账号',
    summary: '社区是玩家自己维护的地方。这份公约管的是发言、发布与相处方式，不涉及比赛结果。',
    clauses: [
      { h: '尊重他人', p: '禁止人身攻击、地域与身份歧视、恶意引战。对事不对人。' },
      { h: '内容合规', p: '禁止发布违法、色情、暴力内容；转载须注明作者与许可协议。' },
      { h: '拒绝刷屏', p: '禁止广告、拉群、诱导下载与重复灌水。招募信息请发到对应分区。' },
      { h: '保护隐私', p: '未经同意不得公开他人真实姓名、联系方式、住址与账号信息。' },
      { h: '善用举报', p: '遇到违规请举报而非对骂；恶意举报同样会被处理。' },
    ],
    gate: '未签署时不能发帖、评论与上传资源',
    active: true,
    builtin: true,
    createdAt: '2026-06-01',
  },
];

export const cookieName = (id: string) => `ag_${id}`;

/** cookie 值格式：`v2.1760968321`（版本 + 签署时间戳） */
export function parseSig(raw?: string | null): { version: string; at: number } | null {
  if (!raw) return null;
  // 版本号本身可能带点（v1.2），只能按最后一个点切开
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const version = raw.slice(0, idx);
  const at = Number(raw.slice(idx + 1));
  if (!version || !Number.isFinite(at)) return null;
  return { version, at };
}

/** 版本不一致视为未签署——公约改版后需要重签 */
export function isSigValid(raw: string | undefined | null, version: string): boolean {
  const sig = parseSig(raw);
  return !!sig && sig.version === version;
}

export function formatSignedAt(at: number): string {
  const d = new Date(at * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
