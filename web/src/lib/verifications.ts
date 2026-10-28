import { apiGetOr } from './api-client';
import type { VerifyRequest } from './verify-types';

/** 认证申请的服务端读取（仅服务端；提交/撤销在客户端组件里直接打 API） */

export async function listMyVerifyRequests(): Promise<VerifyRequest[]> {
  const d = await apiGetOr<{ items: VerifyRequest[] }>('/api/v1/me/verification-requests', {
    items: [],
  });
  return d.items ?? [];
}

export async function listVerifyRequests(status = 'pending'): Promise<VerifyRequest[]> {
  const d = await apiGetOr<{ items: VerifyRequest[] }>(
    `/api/v1/admin/verification-requests?status=${encodeURIComponent(status)}`,
    { items: [] },
  );
  return d.items ?? [];
}
