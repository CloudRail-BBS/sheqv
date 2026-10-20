import { timingSafeEqual } from 'node:crypto';
import { getCurrentUser } from './current-user';
import { config } from './config';
import { SESSION_COOKIE, verifySessionToken } from './session';
import { findById, type PublicUser } from './users';

/**
 * 后台鉴权：**按账号角色判定，没有默认管理员**。
 *
 * - 唯一判定依据是 users.json 里 role === 'admin'；
 *   admin 只能由「第一个注册用户」获得（见 lib/users.ts createUser）。
 * - ADMIN_TOKEN 保留为应急通道（运维脚本 / 救急），默认为空 = 不启用。
 *   它不是"默认管理员账号"，必须部署者显式设置才会生效。
 * - 要多人分权（编辑 / 仲裁 / 审核），把本文件换成带角色的 IdP 即可，
 *   调用点只有 getAdminGate() 与 checkAdminRequest() 两个。
 */

export interface AdminGate {
  ok: boolean;
  user: PublicUser | null;
  via: 'session' | 'token' | null;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length === 0 || x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function tokenHeader(headersObj: Headers): string {
  const auth = headersObj.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer || (headersObj.get('x-admin-token') ?? '');
}

/** 应急通道：只有显式配置了 ADMIN_TOKEN 才可能命中 */
function emergencyTokenOk(headersObj: Headers): boolean {
  if (!config.adminToken) return false;
  return sameString(tokenHeader(headersObj), config.adminToken);
}

/** 服务端组件用 */
export async function getAdminGate(): Promise<AdminGate> {
  const user = await getCurrentUser();
  if (user?.isAdmin) return { ok: true, user, via: 'session' };
  return { ok: false, user, via: null };
}

/** 路由处理器用：会话管理员 或 应急口令 */
export async function checkAdminRequest(req: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<boolean> {
  if (emergencyTokenOk(req.headers)) return true;

  const { userId } = (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) ?? {};
  if (!userId) return false;

  const user = await findById(userId);
  return user?.isAdmin === true;
}
