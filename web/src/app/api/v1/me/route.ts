import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFrom } from '@/lib/current-user';
import { updateUser } from '@/lib/users';
import { normalizeTitle } from '@/lib/badges';

/**
 * PATCH /api/v1/me —— 修改自己的资料。
 *
 * 目前只开放头衔：昵称是帖子里已经落盘的作者名，改名会让历史帖子指向空，
 * 要做的话得先把帖子改成按 id 关联（已有一半改造），不在这次范围内。
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUserFrom(req);
  if (!user) return NextResponse.json({ error: 'need_login', message: '请先登录' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
  if (!body || !('title' in body)) {
    return NextResponse.json({ error: 'invalid_input', message: '没有要修改的内容' }, { status: 422 });
  }

  const checked = normalizeTitle(body.title, user.isAdmin);
  if (!checked.ok) {
    return NextResponse.json({ error: 'invalid_title', message: checked.message }, { status: 422 });
  }

  const updated = await updateUser(user.id, { title: checked.value || null });
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ ok: true, user: updated });
}
