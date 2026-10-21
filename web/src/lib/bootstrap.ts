import type { CapabilityState, Capabilities, Limits } from './capabilities';
import { config } from './config';
import { wsFrom } from './base-url';

/** 与 contracts/bootstrap.openapi.yaml 的 BootstrapResponse 对齐 */
export interface BootstrapResponse {
  client: {
    platform: 'web' | 'android' | 'ios';
    runtime: CapabilityState['runtime'];
    /** 视口形态：同一个 web 端在窄屏下为 mobile */
    form: CapabilityState['form'];
    runtimeSource: CapabilityState['source'];
    isWeChat: boolean;
    version: string;
    channel: string;
    serverTime: string;
  };
  capabilities: Capabilities;
  limits: Limits;
  features: Record<string, boolean>;
  upgrade: {
    policy: 'none' | 'recommend' | 'force';
    minVersion?: string;
    latestVersion?: string;
    title?: string;
    message?: string;
  };
  review: { mode: 'normal' | 'readonly' | 'ugc_disabled'; reason?: string };
  endpoints: { apiBase: string; wsUrl: string; cdnBase: string; shortLinkBase: string };
  notice: { id: string; text: string; level: 'info' | 'warning'; link: string } | null;
  ttl: number;
}

/** 演示用的灰度开关，正式环境来自 flag 注册表 */
const FEATURES: Record<string, boolean> = {
  match_full_flow: true,
  resource_version: true,
  guild_voice_channel: false,
  h5_upload: true,
  tournament: false,
};

export function buildBootstrap(
  state: CapabilityState,
  meta: { version?: string; channel?: string; now?: Date } = {},
  baseUrl = '',
): BootstrapResponse {
  return {
    client: {
      platform: 'web',
      runtime: state.runtime,
      form: state.form,
      runtimeSource: state.source,
      isWeChat: state.isWeChat,
      version: meta.version ?? config.version,
      channel: meta.channel ?? 'web',
      serverTime: (meta.now ?? new Date()).toISOString(),
    },
    capabilities: state.capabilities,
    limits: state.limits,
    features: FEATURES,
    upgrade: { policy: 'none' },
    review: { mode: 'normal' },
    // 对外地址由调用方按「后台设置 → 环境变量 → 请求头」算好后传入，
    // 不再写死 example 域名，也不要求部署者配 PUBLIC_BASE_URL
    endpoints: {
      apiBase: config.endpoints.apiBase,
      wsUrl: baseUrl ? `${wsFrom(baseUrl)}/ws` : '',
      cdnBase: baseUrl,
      shortLinkBase: baseUrl ? `${baseUrl}/s` : '',
    },
    notice: state.isWeChat
      ? {
          id: 'n-101',
          text: '微信内不支持直接下载资源与唤起 App，请点右上角「在浏览器打开」',
          level: 'warning',
          link: '/help/open-in-browser',
        }
      : null,
    ttl: 300,
  };
}

/**
 * ETag 必须只覆盖"稳定配置"，否则 serverTime 每次变化都会让缓存永远失效。
 * 这是最容易踩的一个坑：本地看起来正常，一上线 CDN 命中率归零。
 */
export function etagOf(payload: BootstrapResponse): string {
  const stable = { ...payload, client: { ...payload.client, serverTime: '' } };
  const raw = JSON.stringify(stable);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  return `W/"${(hash >>> 0).toString(16)}-${raw.length}"`;
}
