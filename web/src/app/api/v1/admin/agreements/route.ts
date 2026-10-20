import { NextResponse, type NextRequest } from 'next/server';
import { createAgreement, listAgreements, removeAgreement, setActive, validate } from '@/lib/agreement-store';
import { checkAdminRequest } from '@/lib/admin-auth';

/** 统一的 401：不区分"未登录"与"口令错" */
function unauthorized() {
  return NextResponse.json(
    { error: 'unauthorized', message: '需要管理员账号登录（或配置了 ADMIN_TOKEN 时带 Bearer）' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="blockarena-admin"' } },
  );
}

/** GET /api/v1/admin/agreements —— 含停用的全部公约 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();
  return NextResponse.json({ items: await listAgreements() });
}

/** POST —— 新增公约（后台自由添加） */
export async function POST(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  const error = validate(body);
  if (error) return NextResponse.json({ error }, { status: 422 });

  const item = await createAgreement(body);
  return NextResponse.json({ ok: true, item }, { status: 201 });
}

/** PATCH —— 启用 / 停用（内置公约不可停用） */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = (await req.json().catch(() => null)) as { id?: string; active?: boolean } | null;
  if (!body?.id || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body.id === 'trust' || body.id === 'community') {
    return NextResponse.json({ error: 'builtin_locked' }, { status: 403 });
  }
  const ok = await setActive(body.id, body.active);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}

/** DELETE —— 删除后台新增的公约 */
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  if (id === 'trust' || id === 'community') {
    return NextResponse.json({ error: 'builtin_locked' }, { status: 403 });
  }
  const ok = await removeAgreement(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
