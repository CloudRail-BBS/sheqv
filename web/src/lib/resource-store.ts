import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { ResourceView } from './resource-types';

/**
 * 资源读接口。写操作（发布 / 点赞 / 下载 / 删除）在客户端组件里直接打 API。
 */

export interface ResourceQuery {
  game?: string;
  category?: string;
  q?: string;
  sort?: 'new' | 'likes' | 'downloads';
}

export const listResources = cache(async (query: ResourceQuery = {}): Promise<ResourceView[]> => {
  const sp = new URLSearchParams();
  if (query.game) sp.set('game', query.game);
  if (query.category) sp.set('category', query.category);
  if (query.q) sp.set('q', query.q);
  if (query.sort) sp.set('sort', query.sort);
  const qs = sp.toString();
  const data = await apiGetOr<{ items: ResourceView[] }>(
    `/api/v1/resources${qs ? `?${qs}` : ''}`,
    { items: [] },
  );
  return data.items ?? [];
});

export const getResource = cache(async (id: string): Promise<ResourceView | null> => {
  const data = await apiGetOr<{ item: ResourceView | null }>(
    `/api/v1/resources/${encodeURIComponent(id)}`,
    { item: null },
  );
  return data.item ?? null;
});

export interface DevRow {
  rank: number;
  userId: string;
  nickname: string;
  teamName?: string;
  resources: number;
  downloads: number;
  likes: number;
  score: number;
  since: number;
}

export interface DevTeamRow {
  rank: number;
  teamId: string;
  name: string;
  tag: string;
  color: string;
  members: number;
  resources: number;
  downloads: number;
  likes: number;
  score: number;
}

export interface DeveloperBoard {
  developers: DevRow[];
  teams: DevTeamRow[];
}

export const getDeveloperBoard = cache(async (): Promise<DeveloperBoard> => {
  const data = await apiGetOr<DeveloperBoard>('/api/v1/leaderboard/developers', {
    developers: [],
    teams: [],
  });
  return {
    developers: data.developers ?? [],
    teams: data.teams ?? [],
  };
});

/** 团队名下的资源（团队详情页） */
export const listTeamResources = cache(async (teamId: string): Promise<ResourceView[]> => {
  const data = await apiGetOr<{ items: ResourceView[] }>(
    `/api/v1/dev-teams/${encodeURIComponent(teamId)}/resources`,
    { items: [] },
  );
  return data.items ?? [];
});
