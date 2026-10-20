import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminRequest } from '@/lib/admin-auth';
import { addManual, getSnapshot, removeManual, setHidden } from '@/lib/sponsor-store';
import { afdianConfigured, afdianPageUrl } from '@/lib/afdian';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

/** GET —— 含隐藏项与同步状态 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const snap = await getSnapshot(true);
  return NextResponse.json({
    ok: true,
    items: snap.sponsors,
    syncedAt: snap.syncedAt,
    totalAmount: snap.totalAmount,
    count: snap.count,
    afdian: { configured: afdianConfigured(), pageUrl: afdianPageUrl() },
  });
}

/** POST —— 手动录入赞助者（线下转账、实物支持等） */
export async function POST(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = (await req.json().catch(() => null)) as
    | { name?: string; amount?: string | number; planTitle?: string; note?: string }
    | null;

  try {
    const item = await addManual(body ?? {});
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'INVALID_NAME') {
      return NextResponse.json({ error: 'invalid_name', message: '昵称需 1–24 字' }, { status: 422 });
    }
    if (msg === 'INVALID_AMOUNT') {
      return NextResponse.json({ error: 'invalid_amount', message: '金额需大于 0' }, { status: 422 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

/** PATCH —— 显示 / 隐藏 */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = (await req.json().catch(() => null)) as { id?: string; hidden?: boolean } | null;
  if (!body?.id || typeof body.hidden !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const ok = await setHidden(body.id, body.hidden);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}

/** DELETE —— 仅手动录入的可删 */
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  const result = await removeManual(id);
  if (result === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (result === 'not_manual') {
    return NextResponse.json(
      { error: 'not_manual', message: '爱发电来源的赞助者不能删除，请改用隐藏' },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
