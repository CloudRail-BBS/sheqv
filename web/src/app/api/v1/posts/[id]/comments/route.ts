import { NextResponse, type NextRequest } from 'next/server';
import { addComment } from '@/lib/forum-store';
import { isCommunitySignedFrom } from '@/lib/agreement-state';
import { getCurrentUserFrom } from '@/lib/current-user';

/** POST /api/v1/posts/:id/comments —— 需登录 + 社区公约 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await getCurrentUserFrom(req);
  if (!user) {
    return NextResponse.json({ error: 'need_login', message: '请先登录' }, { status: 403 });
  }

  if (!(await isCommunitySignedFrom(req))) {
    return NextResponse.json({ error: 'need_agreement', message: '请先签署《社区公约》' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body?.trim() ?? '';
  if (text.length < 2) return NextResponse.json({ error: 'invalid_input', message: '评论至少 2 个字' }, { status: 422 });
  if (text.length > 300) return NextResponse.json({ error: 'invalid_input', message: '评论不超过 300 字' }, { status: 422 });

  const comment = await addComment(id, text, user.nickname, user.id);
  if (!comment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
