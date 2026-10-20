import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminRequest } from '@/lib/admin-auth';
import { AfdianError, afdianConfigured, afdianPageUrl, fetchSponsors } from '@/lib/afdian';
import { replaceFromAfdian } from '@/lib/sponsor-store';

/**
 * POST /api/v1/admin/afdian/sync
 * 拉取爱发电赞助者并覆盖快照。也可给 cron 直接调：
 *   curl -X POST https://你的域名/api/v1/admin/afdian/sync -H "Authorization: Bearer $ADMIN_TOKEN"
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminRequest(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!afdianConfigured()) {
    return NextResponse.json(
      {
        error: 'afdian_not_configured',
        message: '未配置 AFDIAN_USER_ID / AFDIAN_TOKEN，无法同步',
      },
      { status: 400 },
    );
  }

  try {
    const { list, totalCount } = await fetchSponsors();
    const saved = await replaceFromAfdian(list);

    return NextResponse.json({
      ok: true,
      fetched: list.length,
      totalCount,
      saved: saved.count,
      totalAmount: saved.total,
      pageUrl: afdianPageUrl(),
    });
  } catch (e) {
    const err = e instanceof AfdianError ? e : null;
    return NextResponse.json(
      {
        error: err?.code ?? 'sync_failed',
        message: err?.message ?? '同步失败，请稍后重试',
      },
      { status: 502 },
    );
  }
}
