/**
 * 端能力层 · 唯一的事实来源
 *
 * 2026-10 变更：Web 与 H5 合并为**单一 web 端**。
 * - 不再有 runtime === 'h5'：移动形态由 responsive 断点决定（form: desktop | mobile）
 * - 能力差异不再来自"端"，而来自真实约束：微信内置浏览器（isWeChat）
 * - 移动端不是降级形态，是同一个端的另一种视口
 *
 * 服务端判定，客户端只消费。32 个布尔 + 6 个配额保持不变。
 */

export type Platform = 'web' | 'android' | 'ios';
export type Runtime = Platform;
export type Form = 'desktop' | 'mobile';

export type RuntimeSource = 'native' | 'forced' | 'wechat' | 'ua-ch' | 'ua-regex' | 'default';

export interface Capabilities {
  auth: { password: boolean; sms: boolean; wechatWebAuth: boolean; wechatQr: boolean; apple: boolean; google: boolean };
  content: { richEditor: boolean; localDraft: boolean; editHistory: boolean; attachmentUpload: boolean; groupChat: boolean };
  media: { presign: boolean; multipart: boolean; resumable: boolean; cameraCapture: boolean; videoExternalOnly: boolean };
  resource: { directDownload: boolean; externalBrowserHint: boolean };
  realtime: { wsForeground: boolean; backgroundPush: boolean; catchupOnResume: boolean };
  share: { wechatJsSdk: boolean; wechatLaunchApp: boolean; universalLink: boolean; nativeShareSheet: boolean; qrPoster: boolean };
  match: { evidenceImageUpload: boolean; evidenceVideoUpload: boolean; arbitration: boolean };
  admin: { console: boolean };
  compliance: { minorMode: boolean; privacyExport: boolean };
}

export interface Limits {
  maxUploadBytes: number;
  chunkConcurrency: number;
  imagesPerPost: number;
  attachmentBytes: number;
  evidenceImageBytes: number;
  evidenceVideoBytes: number;
}

export interface CapabilityState {
  runtime: Runtime;
  form: Form;
  isWeChat: boolean;
  source: RuntimeSource;
  capabilities: Capabilities;
  limits: Limits;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** web 基线：桌面与移动共用同一份能力，差异只来自微信环境 */
const WEB: Capabilities = {
  auth: { password: true, sms: true, wechatWebAuth: false, wechatQr: true, apple: true, google: false },
  content: { richEditor: true, localDraft: true, editHistory: true, attachmentUpload: true, groupChat: true },
  media: { presign: true, multipart: true, resumable: true, cameraCapture: true, videoExternalOnly: false },
  resource: { directDownload: true, externalBrowserHint: false },
  realtime: { wsForeground: true, backgroundPush: false, catchupOnResume: true },
  share: { wechatJsSdk: false, wechatLaunchApp: false, universalLink: true, nativeShareSheet: true, qrPoster: true },
  match: { evidenceImageUpload: true, evidenceVideoUpload: true, arbitration: false },
  admin: { console: true },
  compliance: { minorMode: true, privacyExport: true },
};

const NATIVE: Capabilities = {
  auth: { password: true, sms: true, wechatWebAuth: false, wechatQr: true, apple: false, google: false },
  content: { richEditor: true, localDraft: true, editHistory: true, attachmentUpload: true, groupChat: true },
  media: { presign: true, multipart: true, resumable: true, cameraCapture: true, videoExternalOnly: false },
  resource: { directDownload: true, externalBrowserHint: false },
  realtime: { wsForeground: true, backgroundPush: true, catchupOnResume: true },
  share: { wechatJsSdk: false, wechatLaunchApp: false, universalLink: true, nativeShareSheet: true, qrPoster: true },
  match: { evidenceImageUpload: true, evidenceVideoUpload: true, arbitration: false },
  admin: { console: false },
  compliance: { minorMode: true, privacyExport: true },
};

export const DEFAULTS: Record<Runtime, Capabilities> = {
  web: WEB,
  android: NATIVE,
  ios: { ...NATIVE, auth: { ...NATIVE.auth, apple: true } },
};

const WEB_LIMITS: Limits = {
  maxUploadBytes: 2 * GB,
  chunkConcurrency: 4,
  imagesPerPost: 9,
  attachmentBytes: 200 * MB,
  evidenceImageBytes: 10 * MB,
  evidenceVideoBytes: 512 * MB,
};

export const DEFAULT_LIMITS: Record<Runtime, Limits> = {
  web: WEB_LIMITS,
  android: WEB_LIMITS,
  ios: WEB_LIMITS,
};

/** 微信内置浏览器：唯一需要改能力的场景（不是"端"，是宿主约束） */
export const WECHAT_OVERRIDES: Partial<Capabilities> = {
  auth: { password: true, sms: true, wechatWebAuth: true, wechatQr: false, apple: false, google: false },
  media: { presign: true, multipart: true, resumable: false, cameraCapture: true, videoExternalOnly: true },
  resource: { directDownload: false, externalBrowserHint: true },
  share: { wechatJsSdk: true, wechatLaunchApp: true, universalLink: true, nativeShareSheet: false, qrPoster: true },
  match: { evidenceImageUpload: true, evidenceVideoUpload: false, arbitration: false },
};

/* ───────────── 判定 ───────────── */

const RE_WECHAT = /MicroMessenger|wxwork/i;
const RE_MOBILE = /Android|iPhone|iPod|iPad|Mobile|HarmonyOS/i;

export interface DetectInput {
  ua: string;
  /** sec-ch-ua-mobile：?1 / ?0 */
  chMobile?: string | null;
  /** 仅非生产：把视口强制成 mobile 以便在桌面调试 */
  forcedForm?: string | null;
  platform?: Platform;
}

export function detectRuntime(input: DetectInput): {
  runtime: Runtime;
  form: Form;
  source: RuntimeSource;
  isWeChat: boolean;
} {
  const platform = input.platform ?? 'web';
  const isWeChat = RE_WECHAT.test(input.ua);

  if (platform !== 'web') {
    return { runtime: platform, form: 'mobile', source: 'native', isWeChat: false };
  }

  const forced = input.forcedForm === 'mobile' || input.forcedForm === 'desktop' ? input.forcedForm : null;
  const form: Form =
    forced ??
    (isWeChat
      ? 'mobile'
      : input.chMobile === '?1'
        ? 'mobile'
        : RE_MOBILE.test(input.ua)
          ? 'mobile'
          : 'desktop');

  const source: RuntimeSource =
    forced ? 'forced' : isWeChat ? 'wechat' : input.chMobile === '?1' ? 'ua-ch' : RE_MOBILE.test(input.ua) ? 'ua-regex' : 'default';

  return { runtime: 'web', form, source, isWeChat };
}

/* ───────────── 合并：fail-closed ───────────── */

type BoolPatch = Partial<Record<keyof Capabilities, Record<string, boolean>>>;

function mergeGroup<G extends object>(local: G, patch?: Record<string, boolean>): G {
  const out = { ...(local as unknown as Record<string, boolean>) };
  if (patch) {
    for (const key of Object.keys(out)) {
      const v = patch[key];
      if (typeof v === 'boolean') out[key] = out[key] && v; // 服务端只能关
    }
  }
  return out as G;
}

/** 环境覆盖（微信）可以直接改值——它是宿主事实，不是"服务端想开" */
function applyGroup<G extends object>(local: G, patch?: Record<string, boolean>): G {
  const out = { ...(local as unknown as Record<string, boolean>) };
  if (patch) {
    for (const key of Object.keys(out)) {
      const v = patch[key];
      if (typeof v === 'boolean') out[key] = v;
    }
  }
  return out as G;
}

function compose<G extends object>(base: G, wx?: Record<string, boolean>, server?: Record<string, boolean>): G {
  return mergeGroup(applyGroup(base, wx), server);
}

export function buildCapabilities(
  input: DetectInput,
  payload?: { capabilities?: BoolPatch; limits?: Partial<Limits> } | null,
): CapabilityState {
  const { runtime, form, source, isWeChat } = detectRuntime(input);
  const base = DEFAULTS[runtime];
  const wx = isWeChat ? (WECHAT_OVERRIDES as unknown as BoolPatch) : undefined;

  const caps: Capabilities = {
    auth: compose(base.auth, wx?.auth, payload?.capabilities?.auth),
    content: compose(base.content, wx?.content, payload?.capabilities?.content),
    media: compose(base.media, wx?.media, payload?.capabilities?.media),
    resource: compose(base.resource, wx?.resource, payload?.capabilities?.resource),
    realtime: compose(base.realtime, wx?.realtime, payload?.capabilities?.realtime),
    share: compose(base.share, wx?.share, payload?.capabilities?.share),
    match: compose(base.match, wx?.match, payload?.capabilities?.match),
    admin: compose(base.admin, wx?.admin, payload?.capabilities?.admin),
    compliance: compose(base.compliance, wx?.compliance, payload?.capabilities?.compliance),
  };

  const baseLimits = DEFAULT_LIMITS[runtime];
  const pick = (k: keyof Limits, fallback: number) => {
    const v = payload?.limits?.[k];
    if (typeof v !== 'number' || v <= 0) return fallback;
    return Math.min(v, fallback);
  };

  // 微信内大文件上传不稳定：300MB 上限，录像只收外链
  const limitBase: Limits = isWeChat
    ? { ...baseLimits, maxUploadBytes: 300 * MB, evidenceVideoBytes: 0 }
    : baseLimits;

  return {
    runtime,
    form,
    isWeChat,
    source,
    capabilities: caps,
    limits: {
      maxUploadBytes: pick('maxUploadBytes', limitBase.maxUploadBytes),
      chunkConcurrency: pick('chunkConcurrency', limitBase.chunkConcurrency),
      imagesPerPost: pick('imagesPerPost', limitBase.imagesPerPost),
      attachmentBytes: pick('attachmentBytes', limitBase.attachmentBytes),
      evidenceImageBytes: pick('evidenceImageBytes', limitBase.evidenceImageBytes),
      evidenceVideoBytes: limitBase.evidenceVideoBytes === 0 ? 0 : pick('evidenceVideoBytes', limitBase.evidenceVideoBytes),
    },
  };
}

/* ───────────── 展示辅助 ───────────── */

export function formatBytes(n: number): string {
  if (n === 0) return '—';
  if (n >= GB) return `${(n / GB).toFixed(n % GB === 0 ? 0 : 1)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export function flattenCaps(c: Capabilities): { key: string; value: boolean }[] {
  const out: { key: string; value: boolean }[] = [];
  for (const [group, items] of Object.entries(c)) {
    for (const [name, value] of Object.entries(items as Record<string, boolean>)) {
      out.push({ key: `${group}.${name}`, value });
    }
  }
  return out;
}
