/**
 * 百科的类型与分类常量。
 *
 * 单独成文件的原因：`wiki.ts` 里带着 `api-client`（引了 next/headers，只能在服务端跑），
 * 后台编辑器是客户端组件，只能从这里拿类型，否则整包会被打进 client bundle 并报错。
 */

export interface WikiSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  views: number;
  /** 后台用来区分草稿 */
  published: boolean;
  updatedAt: number;
}

export interface WikiEntry extends WikiSummary {
  body: string;
  author: string;
  authorId: string;
  createdAt: number;
}

export const WIKI_CATEGORIES = [
  { key: 'intro', label: '入门', desc: '第一次来？从这里开始' },
  { key: 'mechanics', label: '玩法机制', desc: '规则、流程与判定标准' },
  { key: 'server', label: '服务器', desc: '开服、联机与常见故障' },
  { key: 'dev', label: '开发', desc: '资源、客户端与接口约定' },
  { key: 'community', label: '社区', desc: '公约、身份组与治理' },
] as const;

export function categoryLabel(key: string): string {
  return WIKI_CATEGORIES.find((c) => c.key === key)?.label ?? '其他';
}


export const fmtDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/* ── 投稿与审核 ───────────────────────────────
   任何登录用户都能提交新词条或修改，先进待审队列，
   管理员通过后才写入词条并生成历史版本。 */

export interface WikiSubmissionBrief {
  id: string;
  /** 空 = 新词条；非空 = 修改已有词条 */
  entryId: string | null;
  entrySlug: string | null;
  title: string;
  summary: string;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string;
  author: string;
  authorId: string;
  createdAt: number;
  reviewedAt: number | null;
}

export interface WikiSubmission extends WikiSubmissionBrief {
  body: string;
  tags: string[];
}

export const SUBMISSION_STATUS: Record<
  WikiSubmissionBrief['status'],
  { label: string; tone: 'warn' | 'ok' | 'danger' }
> = {
  pending: { label: '待审核', tone: 'warn' },
  approved: { label: '已通过', tone: 'ok' },
  rejected: { label: '已驳回', tone: 'danger' },
};
