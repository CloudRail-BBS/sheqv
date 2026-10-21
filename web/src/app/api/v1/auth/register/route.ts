import { NextResponse, type NextRequest } from 'next/server';
import { createUser, validateRegister, type RegisterInput } from '@/lib/users';
import { verifyCaptcha, type CaptchaPayload } from '@/lib/geetest';
import { SESSION_COOKIE, issueSessionToken, sessionCookieOptions } from '@/lib/session';
import { getSettings } from '@/lib/settings';

/**
 * POST /api/v1/auth/register
 * body: { username, nickname, password, captcha? }
 *
 * 第一个注册成功的用户拿到 admin 角色 —— 没有内置管理员账号。
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | (RegisterInput & { captcha?: CaptchaPayload })
    | null;

  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  const settings = await getSettings();
  if (!settings.allowRegister) {
    return NextResponse.json(
      { error: 'register_closed', message: '站点暂时关闭了注册' },
      { status: 403 },
    );
  }

  const invalid = validateRegister(body);
  if (invalid) return NextResponse.json({ error: 'invalid_input', message: invalid }, { status: 422 });

  const captcha = await verifyCaptcha(body.captcha);
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.reason, message: '人机验证未通过，请重新完成验证' },
      { status: 403 },
    );
  }

  try {
    const { user, becameAdmin } = await createUser(body);
    const { token, maxAge } = await issueSessionToken(user.id);

    const res = NextResponse.json({ ok: true, user, becameAdmin }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(req), maxAge });
    return res;
  } catch (e) {
    if (e instanceof Error && e.message === 'USERNAME_TAKEN') {
      return NextResponse.json({ error: 'username_taken', message: '该用户名已被占用' }, { status: 409 });
    }
    if (e instanceof Error && e.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'email_taken', message: '该邮箱已被其他账号使用' }, { status: 409 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
