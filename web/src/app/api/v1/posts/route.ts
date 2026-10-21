import { NextResponse, type NextRequest } from 'next/server';
import { addPost, listPosts, validatePost } from '@/lib/forum-store';
import { isCommunitySignedFrom } from '@/lib/agreement-state';
import { getCurrentUserFrom } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ items: await listPosts() });
}

/** POST /api/v1/posts —— 发帖（需登录 + 签署社区公约） */
export async function POST(req: NextRequest) {
  const user = await getCurrentUserFrom(req);
  if (!user) {
    return NextResponse.json({ error: 'need_login', message: '请先登录' }, { status: 403 });
  }

  if (!(await isCommunitySignedFrom(req))) {
    return NextResponse.json({ error: 'need_agreement', message: '请先签署《社区公约》' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  const invalid = validatePost(body);
  if (invalid) return NextResponse.json({ error: 'invalid_input', message: invalid }, { status: 422 });

  // 作者只能来自会话，不接受客户端传入——否则谁都能冒充别人发帖
  const post = await addPost({ ...body, author: user.nickname, authorId: user.id, guild: '个人' });
  return NextResponse.json({ ok: true, post }, { status: 201 });
}
