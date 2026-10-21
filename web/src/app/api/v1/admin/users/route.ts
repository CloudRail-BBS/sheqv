import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminRequest } from '@/lib/admin-auth';
import { getCurrentUserFrom } from '@/lib/current-user';
import {
  countAdmins,
  listUsers,
  removeUser,
  toPublic,
  updateUser,
  type Role,
} from '@/lib/users';
import { normalizeTitle } from '@/lib/badges';

/**
 * 后台用户管理。
 *
 * 三条防锁死的规则：
 *  1. 不能改自己的角色 / 封禁自己 / 删自己；
 *  2. 任何操作后必须至少剩一个可用管理员；
 *  3. 应急口令（无会话）可以操作，但同样受规则 2 约束。
 */

async function guard(req: NextRequest) {
  if (!(await checkAdminRequest(req))) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const me = await getCurrentUserFrom(req);
  return { me };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;

  const users = await listUsers();
  return NextResponse.json({
    ok: true,
    items: users
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((u) => ({ ...toPublic(u), lastLoginAt: u.lastLoginAt })),
    adminCount: users.filter((u) => u.role === 'admin' && !u.banned).length,
  });
}

/** PATCH —— { id, role?, banned?, title? } */
export async function PATCH(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;

  const body = (await req.json().catch(() => null)) as
    | { id?: string; role?: Role; banned?: boolean; title?: string | null }
    | null;

  if (!body?.id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  if (body.role && body.role !== 'admin' && body.role !== 'member') {
    return NextResponse.json({ error: 'invalid_role' }, { status: 422 });
  }

  // 自己的头衔可以自己改（走 /api/v1/me 也行），但角色与封禁不能自操作
  const self = g.me?.id === body.id;
  if (self && (body.role !== undefined || body.banned !== undefined)) {
    return NextResponse.json(
      { error: 'self_forbidden', message: '不能修改自己的角色或封禁自己' },
      { status: 403 },
    );
  }

  const before = (await listUsers()).find((u) => u.id === body.id);
  if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let title: string | null | undefined;
  if (body.title !== undefined) {
    // 保留字按「改完之后的角色」判断：正在被提为管理员的人可以直接用「管理员」
    const nextIsAdmin = (body.role ?? before.role) === 'admin';
    const checked = normalizeTitle(body.title, nextIsAdmin);
    if (!checked.ok) {
      return NextResponse.json({ error: 'invalid_title', message: checked.message }, { status: 422 });
    }
    title = checked.value || null;
  }

  const losingAdmin =
    before.role === 'admin' && !before.banned && (body.role === 'member' || body.banned === true);
  if (losingAdmin && (await countAdmins()) <= 1) {
    return NextResponse.json(
      { error: 'last_admin', message: '这是最后一个可用管理员，不能降权或封禁' },
      { status: 409 },
    );
  }

  const user = await updateUser(body.id, { role: body.role, banned: body.banned, title });
  return user ? NextResponse.json({ ok: true, user }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}

/** DELETE —— ?id= */
export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  if (g.me?.id === id) {
    return NextResponse.json({ error: 'self_forbidden', message: '不能删除自己' }, { status: 403 });
  }

  const target = (await listUsers()).find((u) => u.id === id);
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (target.role === 'admin' && !target.banned && (await countAdmins()) <= 1) {
    return NextResponse.json(
      { error: 'last_admin', message: '这是最后一个可用管理员，不能删除' },
      { status: 409 },
    );
  }

  const ok = await removeUser(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
