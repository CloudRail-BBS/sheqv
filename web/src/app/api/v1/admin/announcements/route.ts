import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminRequest } from '@/lib/admin-auth';
import {
  createAnnouncement,
  listAnnouncements,
  removeAnnouncement,
  updateAnnouncement,
  validateAnnouncement,
} from '@/lib/announcement-store';

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });

export async function GET(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();
  return NextResponse.json({ ok: true, items: await listAnnouncements() });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  const invalid = validateAnnouncement(body);
  if (invalid) return NextResponse.json({ error: 'invalid_input', message: invalid }, { status: 422 });

  return NextResponse.json({ ok: true, item: await createAnnouncement(body) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = (await req.json().catch(() => null)) as
    | ({ id?: string } & Record<string, unknown>)
    | null;
  if (!body?.id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  const { id, ...patch } = body;
  const item = await updateAnnouncement(id, patch);
  return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  const ok = await removeAnnouncement(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
