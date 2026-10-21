import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFrom } from '@/lib/current-user';
import { markNotificationsRead } from '@/lib/users';

/** POST /api/v1/notifications/read  body?: { at?: number } —— 不传 at 表示"读到现在" */
export async function POST(req: NextRequest) {
  const user = await getCurrentUserFrom(req);
  if (!user) {
    return NextResponse.json({ error: 'need_login' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { at?: number } | null;
  const at = typeof body?.at === 'number' && Number.isFinite(body.at) ? body.at : Date.now();

  const readAt = await markNotificationsRead(user.id, at);
  return NextResponse.json({ ok: true, readAt });
}
