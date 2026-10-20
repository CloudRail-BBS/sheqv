import { NextResponse, type NextRequest } from 'next/server';
import { likePost } from '@/lib/forum-store';

/** POST /api/v1/posts/:id/like —— 点赞不需要签公约 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const likes = await likePost(id);
  if (likes === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, likes });
}
