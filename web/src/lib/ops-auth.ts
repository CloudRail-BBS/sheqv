import { getCurrentUser } from './current-user';
import type { PublicUser } from './users';

/**
 * 运营面板权限。
 *
 * 判定口径与后端 `OpsActor` 保持一致：
 * - 管理员天然可以进；
 * - 其他人看身份组里有没有勾 `ops.console`（「进入运营面板」）。
 *
 * 前端这份只用于**显示与否**，真正的拦截在 `OpsActor`（后端）。
 */
export const OPS_PERMISSION = 'ops.console';

export function canEnterOps(user: PublicUser | null): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return (user.permissions ?? []).includes(OPS_PERMISSION);
}

export interface OpsGate {
  ok: boolean;
  user: PublicUser | null;
}

export async function getOpsGate(): Promise<OpsGate> {
  const user = await getCurrentUser();
  return { ok: canEnterOps(user), user };
}
