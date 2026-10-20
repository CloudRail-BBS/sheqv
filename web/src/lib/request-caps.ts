import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { buildCapabilities, type CapabilityState } from './capabilities';

/**
 * 每个请求只解析一次（React cache 去重）。
 * 服务端是唯一判定方：客户端不做 UA 解析，只消费这里的结果。
 */
export const getRequestCaps = cache(async (): Promise<CapabilityState> => {
  const h = await headers();
  const c = await cookies();

  const devForced = process.env.NODE_ENV !== 'production' ? c.get('__form')?.value ?? null : null;

  return buildCapabilities({
    ua: h.get('user-agent') ?? '',
    chMobile: h.get('sec-ch-ua-mobile'),
    forcedForm: devForced,
    platform: 'web',
  });
});

export const getTheme = cache(async (): Promise<'dark' | 'light'> => {
  const c = await cookies();
  return c.get('theme')?.value === 'light' ? 'light' : 'dark';
});
