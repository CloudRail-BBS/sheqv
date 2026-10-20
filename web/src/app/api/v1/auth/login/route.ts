import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/users';
import { verifyCaptcha, type CaptchaPayload } from '@/lib/geetest';
import { SESSION_COOKIE, issueSessionToken, sessionCookieOptions } from '@/lib/session';

/** POST /api/v1/auth/login  body: { username, password, captcha? } */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { username?: string; password?: string; captcha?: CaptchaPayload }
    | null;

  if (!body?.username || !body.password) {
    return NextResponse.json({ error: 'invalid_input', message: '请填写用户名和密码' }, { status: 422 });
  }

  const captcha = await verifyCaptcha(body.captcha);
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.reason, message: '人机验证未通过，请重新完成验证' },
      { status: 403 },
    );
  }

  const user = await authenticate(body.username, body.password);
  if (!user) {
    // 不区分「用户不存在」与「密码错误」
    return NextResponse.json({ error: 'invalid_credentials', message: '用户名或密码不正确' }, { status: 401 });
  }

  const { token, maxAge } = await issueSessionToken(user.id);
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge });
  return res;
}
