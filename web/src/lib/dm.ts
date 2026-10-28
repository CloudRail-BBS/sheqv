import { cache } from 'react';
import { apiGetOr } from './api-client';
import type { DmConversation } from './dm-types';

/**
 * 服务端取私聊会话列表。
 *
 * 只给首屏用；后续刷新由客户端轮询 `/api/v1/dm`，所以这里 `cache()` 到请求级即可，
 * 不要跨请求缓存——未读数必须是实时的。
 */
export const listConversations = cache(async (): Promise<DmConversation[]> => {
  const data = await apiGetOr<{ items?: DmConversation[] }>('/api/v1/dm', { items: [] });
  return data.items ?? [];
});
