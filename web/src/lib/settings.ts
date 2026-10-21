import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';
import { config } from './config';

/**
 * 站点设置：把原本只能改环境变量的项搬到后台。
 *
 * 存储：$DATA_DIR/settings.json，**只存被改过的字段**，读取时与 env 默认值合并。
 * 优先级：settings.json > 环境变量 > 内置默认。
 *
 * 有意**不**放进后台的项（写进 JSON 明文或需启动期确定）：
 *  - SESSION_SECRET / ADMIN_TOKEN：密钥落 JSON 会随备份泄漏
 *  - DATA_DIR / PORT：启动前就要确定
 *  - PUBLIC_BASE_URL：会影响 Cookie 的 Secure 标记，改了必须重启，后台只读展示
 */
export interface SiteSettings {
  siteName: string;
  /** 对外地址；留空则按请求头推导（推荐留空） */
  publicBaseUrl: string;
  geetestId: string;
  geetestKey: string;
  afdianUserId: string;
  afdianToken: string;
  afdianPageUrl: string;
  /** 关闭后注册接口直接拒绝，注册页显示"暂停注册" */
  allowRegister: boolean;
  /** 首页右栏是否显示最新公告 */
  homeShowAnnouncements: boolean;
}

type Patch = Partial<SiteSettings>;

const FILE = dataFile('settings.json');

/** 从环境变量得到的默认值 */
function envDefaults(): SiteSettings {
  return {
    siteName: config.siteName,
    publicBaseUrl: config.publicBaseUrl,
    geetestId: config.geetest.id,
    geetestKey: config.geetest.key,
    afdianUserId: config.afdian.userId,
    afdianToken: config.afdian.token,
    afdianPageUrl: config.afdian.pageUrl,
    allowRegister: true,
    homeShowAnnouncements: true,
  };
}

/** 只保留认识的键，避免写进乱七八糟的值 */
const KEYS: (keyof SiteSettings)[] = [
  'siteName',
  'publicBaseUrl',
  'geetestId',
  'geetestKey',
  'afdianUserId',
  'afdianToken',
  'afdianPageUrl',
  'allowRegister',
  'homeShowAnnouncements',
];

async function readOverrides(): Promise<Patch> {
  const raw = await readJson<Record<string, unknown>>(FILE, {});
  const out: Patch = {};
  for (const k of KEYS) {
    const v = raw[k];
    if (typeof v === 'string') (out as Record<string, unknown>)[k] = v;
    else if (typeof v === 'boolean') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function getSettings(): Promise<SiteSettings> {
  return { ...envDefaults(), ...(await readOverrides()) };
}

/** 只返回被后台覆盖过的字段，用于后台表单标记"已覆盖" */
export async function getOverrides(): Promise<Patch> {
  return readOverrides();
}

export async function updateSettings(patch: Patch): Promise<SiteSettings> {
  const clean: Patch = {};
  for (const k of KEYS) {
    const v = patch[k];
    if (typeof v === 'string' || typeof v === 'boolean') {
      (clean as Record<string, unknown>)[k] = v;
    }
  }

  await serialize(async () => {
    const current = await readOverrides();
    await writeJsonAtomic(FILE, { ...current, ...clean });
  });

  return getSettings();
}

/** 清掉某个覆盖项，回落到环境变量 */
export async function resetSetting(key: keyof SiteSettings): Promise<SiteSettings> {
  await serialize(async () => {
    const current = await readOverrides();
    delete current[key];
    await writeJsonAtomic(FILE, current);
  });
  return getSettings();
}
