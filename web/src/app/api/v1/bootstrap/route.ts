import { NextResponse, type NextRequest } from 'next/server';
import { buildCapabilities } from '@/lib/capabilities';
import { buildBootstrap, etagOf } from '@/lib/bootstrap';

/**
 * GET /api/v1/bootstrap
 * 与 contracts/bootstrap.openapi.yaml 对齐的最小实现：
 *  - 服务端解析 UA 决定 runtime，忽略客户端上报
 *  - 支持 If-None-Match → 304
 *  - 返回 capabilities / limits / features / notice / ttl
 */
export function GET(req: NextRequest) {
  const forced =
    process.env.NODE_ENV !== 'production' ? req.cookies.get('__runtime')?.value ?? null : null;

  const state = buildCapabilities({
    ua: req.headers.get('user-agent') ?? '',
    chMobile: req.headers.get('sec-ch-ua-mobile'),
    forcedForm: forced,
  });

  const payload = buildBootstrap(state, {
    version: req.headers.get('x-client-version') ?? undefined,
    channel: req.headers.get('x-client-channel') ?? undefined,
  });

  const etag = etagOf(payload);
  const ifNoneMatch = req.headers.get('if-none-match');

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'private, max-age=300' },
    });
  }

  return NextResponse.json(payload, {
    headers: {
      ETag: etag,
      'Cache-Control': 'private, max-age=300',
      'x-runtime': state.runtime,
      'x-runtime-source': state.source,
    },
  });
}
