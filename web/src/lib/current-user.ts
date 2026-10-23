import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { PublicUser } from './users';

/**
 * 当前登录用户：直接问后端 `/api/v1/auth/state`（会话校验、封禁判定都在那边）。
 *
 * 外层 `cache()` 做请求内去重——一次渲染里 layout / page / 组件都取用户，只发一次请求。
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const data = await apiGetOr<{ user: PublicUser | null }>('/api/v1/auth/state', { user: null });
  return data.user ?? null;
});
