import { NextResponse, type NextRequest } from 'next/server';
import { createUser, validateRegister, type RegisterInput } from '@/lib/users';
import { verifyCaptcha, type CaptchaPayload } from '@/lib/geetest';
import { SESSION_COOKIE, issueSessionToken, sessionCookieOptions } from '@/lib/session';

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
    res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge });
    return res;
  } catch (e) {
    if (e instanceof Error && e.message === 'USERNAME_TAKEN') {
      return NextResponse.json({ error: 'username_taken', message: '该用户名已被占用' }, { status: 409 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
