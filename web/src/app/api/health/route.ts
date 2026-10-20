import { NextResponse } from 'next/server';
import { config, checkDataDir } from '@/lib/config';

/**
 * GET /api/health —— 给 Docker healthcheck / 反向代理 / 监控用。
 * 只暴露最少信息：不返回环境变量、不返回路径细节以外的内容。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await checkDataDir();

  const body = {
    ok: data.writable,
    service: 'blockarena-web',
    version: config.version,
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
    checks: {
      dataDir: data.writable ? 'ok' : 'unwritable',
    },
    ...(data.writable ? {} : { error: data.error }),
  };

  return NextResponse.json(body, { status: data.writable ? 200 : 503 });
}
