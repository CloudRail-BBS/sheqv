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

  // 站点标识：文字最多两个字，图片只放行 http(s) 与站内绝对路径
  if (typeof body.logoText === 'string') {
    body.logoText = body.logoText.trim();
    if (Array.from(body.logoText).length > 2) {
      return NextResponse.json({ error: 'invalid_logo', message: '站点标识最多 2 个字' }, { status: 422 });
    }
  }
  if (typeof body.logoImage === 'string') {
    body.logoImage = body.logoImage.trim();
    if (body.logoImage && !/^(https?:\/\/|\/)/i.test(body.logoImage)) {
      return NextResponse.json(
        { error: 'invalid_logo', message: '标识图片需以 http(s):// 或 / 开头' },
        { status: 422 },
      );
    }
  }

  const settings = await updateSettings(body);
  return NextResponse.json({ ok: true, settings });
}
