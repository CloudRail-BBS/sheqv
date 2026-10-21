import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminRequest } from '@/lib/admin-auth';
import { deletePost, listPosts } from '@/lib/forum-store';

/** GET /api/v1/admin/posts —— 含作者与互动数 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminRequest(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const posts = await listPosts();
  return NextResponse.json({ ok: true, items: posts });
}

/** DELETE /api/v1/admin/posts?id= —— 连带评论与点赞 */
export async function DELETE(req: NextRequest) {
  if (!(await checkAdminRequest(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  const ok = await deletePost(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
