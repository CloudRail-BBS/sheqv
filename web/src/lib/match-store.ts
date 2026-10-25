import { apiGetOr } from './api-client';
import type { MatchView } from './match-types';

export async function listMatches(status?: string): Promise<MatchView[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const d = await apiGetOr<{ items: MatchView[] }>(`/api/v1/matches${qs}`, { items: [] });
  return d.items;
}

export async function getMatch(id: string): Promise<MatchView | null> {
  const d = await apiGetOr<{ item: MatchView | null }>(
    `/api/v1/matches/${encodeURIComponent(id)}`,
    { item: null },
  );
  return d.item ?? null;
}
