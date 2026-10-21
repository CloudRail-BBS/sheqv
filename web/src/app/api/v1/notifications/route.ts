import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFrom } from '@/lib/current-user';
import { getNotifications } from '@/lib/notifications';

/** GET /api/v1/notifications —— 顶栏快捷面板与通知页共用 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFrom(req);
  const feed = await getNotifications(user);

  return NextResponse.json(
    { ok: true, loggedIn: Boolean(user), unread: feed.unread, items: [...feed.pending, ...feed.comments] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
