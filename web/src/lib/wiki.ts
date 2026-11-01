import { apiGetOr } from './api-client';
import { headingAnchor } from './markdown';

/** 百科词条（列表用，不带正文） */
import type { WikiEntry, WikiSummary } from './wiki-types';

export * from './wiki-types';

export async function listWiki(params: {
  category?: string;
  q?: string;
} = {}): Promise<WikiSummary[]> {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.q?.trim()) search.set('q', params.q.trim());
  const qs = search.toString();
  const d = await apiGetOr<{ items: WikiSummary[] }>(`/api/v1/wiki${qs ? `?${qs}` : ''}`, {
    items: [],
  });
  return d.items ?? [];
}

export async function getWiki(
  slug: string,
): Promise<{ entry: WikiEntry; related: WikiSummary[] } | null> {
  const d = await apiGetOr<{ entry: WikiEntry | null; related: WikiSummary[] }>(
    `/api/v1/wiki/${encodeURIComponent(slug)}`,
    { entry: null, related: [] },
  );
  if (!d.entry) return null;
  return { entry: d.entry, related: d.related ?? [] };
}

/** 正文里的二三级标题 → 右侧目录（id 与 Markdown 渲染时生成的一致） */
export function tocOf(body: string): { id: string; label: string; level: number }[] {
  const out: { id: string; label: string; level: number }[] = [];
  const seen = new Map<string, number>();
  for (const line of body.split('\n')) {
    const m = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const raw = m[2].replace(/[*_`~]/g, '').trim();
    const base = headingAnchor(raw);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({
      id: n === 0 ? base : `${base}-${n + 1}`,
      label: raw,
      level: m[1].length,
    });
  }
  return out;
}
