import { NextResponse, type NextRequest } from 'next/server';
import { detectRuntime } from '@/lib/capabilities';

/**
 * 单一 web 端之后，移动端不再被当作"另一种端"拦截。
 * 这里只做两件事：把判定结果透出去（便于观测/CDN 分流），以及给 HTML 加 Vary。
 */
export function middleware(req: NextRequest) {
  const forced =
    process.env.NODE_ENV !== 'production' ? req.cookies.get('__form')?.value ?? null : null;

  const { runtime, form, isWeChat, source } = detectRuntime({
    ua: req.headers.get('user-agent') ?? '',
    chMobile: req.headers.get('sec-ch-ua-mobile'),
    forcedForm: forced,
  });

  const res = NextResponse.next();
  res.headers.set('x-runtime', runtime);
  res.headers.set('x-form', form);
  res.headers.set('x-runtime-source', source);
  res.headers.set('x-wechat', isWeChat ? '1' : '0');
  res.headers.append('Vary', 'User-Agent, Sec-CH-UA-Mobile, Cookie');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
