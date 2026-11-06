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

/* 分类不再写死：存在后台可维护的 content_categories 表里，见 category-types.ts */

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
