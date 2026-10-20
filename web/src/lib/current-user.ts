import { cache } from 'react';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './session';
import { findById, type PublicUser } from './users';

/**
 * 当前登录用户。
 *
 * 两种取法必须分开：
 *  - `getCurrentUser()` 给服务端组件用，走 next/headers，外层 React cache 做每请求去重；
 *  - `getCurrentUserFrom(req)` 给 Route Handler 用，直接读 req.cookies。
 *
 * 为什么不能合并：在 Route Handler（非 RSC）里，被 React `cache()` 包住的函数
 * 会在请求上下文之外求值，`cookies()` 会抛 "called outside a request scope"，
 * 表现就是接口 500。这个坑只在请求阶段暴露，构建期看不出来。
 */

async function resolve(token?: string | null): Promise<PublicUser | null> {
  const { userId } = (await verifySessionToken(token)) ?? {};
  if (!userId) return null;
  return findById(userId);
}

export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const c = await cookies();
  return resolve(c.get(SESSION_COOKIE)?.value);
});

export async function getCurrentUserFrom(req: NextRequest): Promise<PublicUser | null> {
  return resolve(req.cookies.get(SESSION_COOKIE)?.value);
}
