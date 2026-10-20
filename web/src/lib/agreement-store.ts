import { BUILTIN_AGREEMENTS, today, type Agreement, type Clause } from './agreements';
import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';

/**
 * 公约存储：内置两份 + 后台新增（落 $DATA_DIR/agreements.json）
 * 没有数据库，用文件模拟；换成真实后端时替换本文件即可，页面调用签名不变。
 */

const FILE = dataFile('agreements.json');

async function readCustom(): Promise<Agreement[]> {
  const parsed = await readJson<Agreement[]>(FILE, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeCustom(list: Agreement[]): Promise<void> {
  return serialize(() => writeJsonAtomic(FILE, list));
}

export async function listAgreements(): Promise<Agreement[]> {
  const custom = await readCustom();
  return [...BUILTIN_AGREEMENTS, ...custom.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))];
}

export async function listActive(): Promise<Agreement[]> {
  return (await listAgreements()).filter((a) => a.active);
}

export async function getAgreement(id: string): Promise<Agreement | null> {
  return (await listAgreements()).find((a) => a.id === id) ?? null;
}

export interface NewAgreementInput {
  title?: string;
  version?: string;
  scope?: string;
  summary?: string;
  gate?: string;
  clauses?: Clause[];
}

export function validate(input: NewAgreementInput): string | null {
  const title = input.title?.trim() ?? '';
  const version = input.version?.trim() ?? '';
  if (title.length < 2 || title.length > 20) return '标题需 2–20 字';
  if (!version) return '请填写版本号，例如 v1';
  if (!input.summary?.trim()) return '请填写简介';
  if (!input.scope?.trim()) return '请填写适用范围';
  if (!input.gate?.trim()) return '请填写未签署限制';
  if (!Array.isArray(input.clauses) || input.clauses.filter((c) => c.h?.trim() && c.p?.trim()).length < 1) {
    return '至少填写一条条款';
  }
  return null;
}

export async function createAgreement(input: NewAgreementInput): Promise<Agreement> {
  const clauses = (input.clauses ?? [])
    .map((c) => ({ h: (c.h ?? '').trim(), p: (c.p ?? '').trim() }))
    .filter((c) => c.h && c.p);

  const item: Agreement = {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    title: (input.title ?? '').trim(),
    short: (input.title ?? '').trim().slice(0, 2),
    version: (input.version ?? '').trim(),
    updatedAt: today(),
    scope: (input.scope ?? '').trim(),
    summary: (input.summary ?? '').trim(),
    clauses,
    gate: (input.gate ?? '').trim(),
    active: true,
    createdAt: new Date().toISOString(),
  };

  // 读-改-写必须在同一个串行区间内，否则两个并发新增会互相覆盖
  await serialize(async () => {
    const custom = await readCustom();
    custom.push(item);
    await writeJsonAtomic(FILE, custom);
  });

  return item;
}

export async function setActive(id: string, active: boolean): Promise<boolean> {
  let found = false;
  await serialize(async () => {
    const custom = await readCustom();
    const target = custom.find((a) => a.id === id);
    if (!target) return;
    target.active = active;
    found = true;
    await writeJsonAtomic(FILE, custom);
  });
  return found;
}

export async function removeAgreement(id: string): Promise<boolean> {
  let found = false;
  await serialize(async () => {
    const custom = await readCustom();
    const next = custom.filter((a) => a.id !== id);
    if (next.length === custom.length) return;
    found = true;
    await writeJsonAtomic(FILE, next);
  });
  return found;
}
