import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUserFrom } from '@/lib/current-user';
import { countUsers } from '@/lib/users';

/**
 * GET /api/v1/auth/state
 * 给前端与冒烟脚本判断：是否已有账号（决定"首个用户将成为管理员"提示）、当前是谁。
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const [user, total] = await Promise.all([getCurrentUserFrom(req), countUsers()]);

  return NextResponse.json(
    {
      initialized: total > 0,
      userCount: total,
      user,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
