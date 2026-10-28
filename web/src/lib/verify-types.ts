/** 蓝标 / 红标认证的纯类型（客户端组件可直接引用） */

export type VerifyKind = 'blue' | 'red';
export type VerifyStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const VERIFY_KIND_META: Record<
  VerifyKind,
  { label: string; short: string; desc: string; hint: string }
> = {
  blue: {
    label: '蓝标认证',
    short: '蓝标',
    desc: '个人认证',
    hint: '发给持续产出内容的个人：创作者、服主、教程作者、模组开发者等。',
  },
  red: {
    label: '红标认证',
    short: '红标',
    desc: '机构认证',
    hint: '发给组织与官方主体：公会、战队、开发团队、服务器团队、媒体等。',
  },
};

/** 申请时的类别选项；仅作引导，后端只限长度 */
export const VERIFY_CATEGORIES = [
  '内容创作者',
  '服务器服主',
  '模组 / 插件开发者',
  '公会',
  '战队',
  '开发团队',
  '媒体 / 社区',
  '其他',
];

export const VERIFY_STATUS_LABEL: Record<VerifyStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
  cancelled: '已撤销',
};

export function verifyKindLabel(kind?: string): string {
  if (kind === 'blue') return VERIFY_KIND_META.blue.label;
  if (kind === 'red') return VERIFY_KIND_META.red.label;
  return '未认证';
}

export function isVerifyKind(v: unknown): v is VerifyKind {
  return v === 'blue' || v === 'red';
}

export interface VerifyRequest {
  id: string;
  userId?: string;
  nickname?: string;
  avatar?: string;
  kind: VerifyKind;
  subject: string;
  category: string;
  evidence: string;
  contact: string;
  /** 通过时管理员确认的对外说明 */
  label: string;
  status: VerifyStatus;
  reviewNote: string;
  createdAt: number;
  reviewedAt?: number;
  /** 申请人当前已生效的认证（可能是升级前的旧标） */
  currentKind?: string;
}
