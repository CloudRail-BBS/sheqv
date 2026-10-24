import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { DevTeam } from './dev-team-types';

/** 开发团队读接口；写操作在客户端组件里直接打 API。 */

export const listDevTeams = cache(async (q?: string): Promise<DevTeam[]> => {
  const data = await apiGetOr<{ items: DevTeam[] }>(
    `/api/v1/dev-teams${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    { items: [] },
  );
  return data.items ?? [];
});

export const getDevTeam = cache(async (id: string): Promise<DevTeam | null> => {
  const data = await apiGetOr<{ item: DevTeam | null }>(
    `/api/v1/dev-teams/${encodeURIComponent(id)}`,
    { item: null },
  );
  return data.item ?? null;
});

export const listMyDevTeams = cache(async (): Promise<DevTeam[]> => {
  const data = await apiGetOr<{ items: DevTeam[] }>('/api/v1/me/dev-teams', { items: [] });
  return data.items ?? [];
});
