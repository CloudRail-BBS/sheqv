import { createHmac } from 'node:crypto';
import { config } from './config';

/**
 * GeeTest v4（行为验证）服务端二次校验。
 *
 * 客户端拿到的是 lot_number / captcha_output / pass_token / gen_time，
 * 服务端用私钥算 sign_token 再去 gcaptcha4/validate 换结论。
 * **不能只信前端的 onSuccess**——那只是"人完成了拼图"，不代表票据有效。
 */

export interface CaptchaPayload {
  lot_number?: string;
  captcha_output?: string;
  pass_token?: string;
  gen_time?: string;
}

export type CaptchaResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: string };

/** id 与 key 同时存在才算启用 */
export function captchaEnabled(): boolean {
  return Boolean(config.geetest.id && config.geetest.key);
}

/**
 * 可以下发给浏览器的 captcha id。
 * 只有 id + key 都在才返回——否则前端渲染了验证码、服务端却跳过校验，
 * 用户会以为"验了但没生效"，不如干脆不显示。
 */
export function publicCaptchaId(): string {
  return captchaEnabled() ? config.geetest.id : '';
}

export async function verifyCaptcha(payload?: CaptchaPayload | null): Promise<CaptchaResult> {
  if (!captchaEnabled()) return { ok: true, skipped: true };

  const { id, key, bypassOnError } = config.geetest;
  const lot = payload?.lot_number?.trim();
  const output = payload?.captcha_output?.trim();
  const passToken = payload?.pass_token?.trim();
  const genTime = payload?.gen_time?.trim();

  if (!lot || !output || !passToken || !genTime) {
    return { ok: false, reason: 'missing_captcha' };
  }

  const signToken = createHmac('sha256', key).update(lot).digest('hex');

  const body = new URLSearchParams({
    lot_number: lot,
    captcha_output: output,
    pass_token: passToken,
    gen_time: genTime,
    sign_token: signToken,
  });

  try {
    const res = await fetch(
      `https://gcaptcha4.geetest.com/validate?captcha_id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        // 校验接口慢于 5 秒就按失败处理，避免注册被拖住
        signal: AbortSignal.timeout(5000),
      },
    );

    const data = (await res.json()) as { status?: string; result?: string; reason?: string };

    if (data.status === 'success' && data.result === 'success') {
      return { ok: true, skipped: false };
    }
    return { ok: false, reason: data.reason || 'captcha_failed' };
  } catch {
    // 网络异常 / 超时：默认拒绝。只有显式开了宕机模式才放行。
    if (bypassOnError) return { ok: true, skipped: true };
    return { ok: false, reason: 'captcha_unreachable' };
  }
}
