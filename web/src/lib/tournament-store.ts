import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { Tournament, TournamentEntry } from './task-types';

/** 赛事读接口（仅服务端）；报名/取消在客户端组件里直接打 API。 */

export async function listTournaments(): Promise<Tournament[]> {
  const d = await apiGetOr<{ items: Tournament[] }>('/api/v1/tournaments', { items: [] });
  return d.items ?? [];
}

export interface TournamentDetail {
  item: Tournament;
  entries: TournamentEntry[];
  myEntry: TournamentEntry | null;
}

export const getTournament = cache(async (id: string): Promise<TournamentDetail | null> => {
  const d = await apiGetOr<{
    item?: Tournament;
    entries?: TournamentEntry[];
    myEntry?: TournamentEntry | null;
  }>(`/api/v1/tournaments/${encodeURIComponent(id)}`, {});
  if (!d.item) return null;
  return {
    item: d.item,
    entries: d.entries ?? [],
    myEntry: d.myEntry ?? null,
  };
});
