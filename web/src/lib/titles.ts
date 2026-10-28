import { apiGetOr } from './api-client';
import type { TitleRequest } from './title-types';

/** 头衔申请的服务端读取（仅服务端；提交/撤销在客户端组件里直接打 API） */

export async function listMyTitleRequests(): Promise<TitleRequest[]> {
  const d = await apiGetOr<{ items: TitleRequest[] }>('/api/v1/me/title-requests', {
    items: [],
  });
  return d.items ?? [];
}

export async function listTitleRequests(status = 'pending'): Promise<TitleRequest[]> {
  const d = await apiGetOr<{ items: TitleRequest[] }>(
    `/api/v1/admin/title-requests?status=${encodeURIComponent(status)}`,
    { items: [] },
  );
  return d.items ?? [];
}
