import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/sponsor-store';

/**
 * GET /api/v1/sponsors —— 公开的赞助者名单（只含展示中的）。
 * 页面自己读快照；这个接口给外部嵌入与自动化校验用，避免依赖页面缓存。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const snap = await getSnapshot();

  return NextResponse.json(
    {
      ok: true,
      totalAmount: snap.totalAmount,
      count: snap.count,
      syncedAt: snap.syncedAt,
      items: snap.sponsors,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
