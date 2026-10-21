import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminRequest } from '@/lib/admin-auth';
import { getOverrides, getSettings, resetSetting, updateSettings, type SiteSettings } from '@/lib/settings';

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });

export async function GET(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();
  const [settings, overrides] = await Promise.all([getSettings(), getOverrides()]);
  return NextResponse.json({ ok: true, settings, overrides });
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return unauthorized();

  const body = (await req.json().catch(() => null)) as
    | ({ resetKey?: keyof SiteSettings } & Partial<SiteSettings>)
    | null;
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  if (body.resetKey) {
    const settings = await resetSetting(body.resetKey);
    return NextResponse.json({ ok: true, settings });
  }

  const settings = await updateSettings(body);
  return NextResponse.json({ ok: true, settings });
}
