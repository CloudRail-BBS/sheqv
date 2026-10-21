import path from 'node:path';

/**
 * 自托管配置：所有外部地址与密钥都从环境变量读，
 * 代码里不出现任何托管平台专有的域名或凭据。
 *
 * 只允许在服务端 import（页面 / route / store）。
 */

function env(key: string): string {
  return (process.env[key] ?? '').trim();
}

function envOr(key: string, fallback: string): string {
  return env(key) || fallback;
}

function envFlag(key: string, fallback = false): boolean {
  const v = env(key).toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** 去掉结尾斜杠，避免拼出 // 路径 */
function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

const baseUrl = trimBase(envOr('PUBLIC_BASE_URL', 'http://localhost:8900'));

/** http(s) → ws(s)，用于推导默认 WS 地址 */
function wsFrom(httpUrl: string): string {
  return httpUrl.replace(/^http/i, 'ws');
}

export const config = {
  /** 站点名，出现在标题与品牌位 */
  siteName: envOr('SITE_NAME', '方块竞技场'),

  /** 对外可访问的根地址：反代后必须填真实域名，否则短链/分享会错 */
  publicBaseUrl: baseUrl,

  /** 应用版本，写进 bootstrap 的 client.version */
  version: envOr('APP_VERSION', '2026.10.20-1'),

  /** 是否已上生产（关闭 dev 强制切换、演示提示等） */
  isProd: process.env.NODE_ENV === 'production',

  /**
   * 数据目录。默认 <cwd>/.data；容器里建议挂 /data 卷并设 DATA_DIR=/data。
   * 这是唯一需要持久化的目录（论坛、公约）。
   */
  dataDir: path.resolve(envOr('DATA_DIR', path.join(process.cwd(), '.data'))),

  /** 管理后台口令。为空 = 不启用鉴权（仅限本地演示） */
  adminToken: env('ADMIN_TOKEN'),

  /**
   * 会话签名密钥。不配则自动生成 $DATA_DIR/.session-secret。
   * 多实例部署必须显式配置同一个值，否则各实例互相不认 Cookie。
   */
  sessionSecret: env('SESSION_SECRET'),

  /**
   * GeeTest v4 人机验证。
   * id + key 都配了才启用；只配一半视为未配置（否则服务端会拒掉所有注册）。
   */
  geetest: {
    // 兼容只配了 NEXT_PUBLIC_GEETEST_ID 的常见写法，否则前端拿不到 ID 就永远不显示验证码
    id: env('GEETEST_ID') || env('NEXT_PUBLIC_GEETEST_ID'),
    key: env('GEETEST_KEY'),
    /** GeeTest 官方"宕机模式"：校验接口不可达时放行，默认关（失败即拒绝） */
    bypassOnError: envFlag('GEETEST_BYPASS_ON_ERROR', false),
  },

  /** 后台登录页展示的用户名（与口令一起用于口令提示） */
  adminUser: envOr('ADMIN_USER', 'admin'),

  /**
   * 爱发电赞助。
   * user_id + token 都配了才启用；缺一个视为未开启（页面上会说明）。
   */
  afdian: {
    userId: env('AFDIAN_USER_ID'),
    token: env('AFDIAN_TOKEN'),
    /** 公开赞助页地址，默认按 user_id 拼 https://afdian.com/a/<user_id> */
    pageUrl: trimBase(env('AFDIAN_PAGE_URL')),
  },

  /** 生产环境是否仍开放 /dev/capabilities（默认关闭） */
  devConsole: envFlag('ENABLE_DEV_CONSOLE', !process.env.NODE_ENV || process.env.NODE_ENV !== 'production'),

  /** 是否在页脚显示"自托管"标记 */
  selfHosted: envFlag('SELF_HOSTED', true),

  endpoints: {
    /** 前端调用的 API 前缀，默认同源 */
    apiBase: envOr('API_BASE', '/api'),
    /** 实时通道；未配置时按 PUBLIC_BASE_URL 推导，不再是 example 域名 */
    wsUrl: envOr('WS_URL', `${wsFrom(baseUrl)}/ws`),
    /** 静态资源/CDN 前缀；自托管默认同源 */
    cdnBase: trimBase(envOr('CDN_BASE', baseUrl)),
    /** 短链前缀 */
    shortLinkBase: trimBase(envOr('SHORT_LINK_BASE', `${baseUrl}/s`)),
  },

  /** 部署拓扑提示：反代后需要信任 X-Forwarded-* 才能拿到真实 IP/协议 */
  trustProxy: envFlag('TRUST_PROXY', true),
} as const;

/**
 * 给健康检查用：数据目录是否可写。
 * 不写探针文件（healthcheck 每 30s 一次，没必要动磁盘），
 * 用 mkdir + access(W_OK) 判断：只读挂载与权限不足都会在这里失败。
 */
export async function checkDataDir(): Promise<{ dir: string; writable: boolean; error?: string }> {
  const { promises: fs } = await import('node:fs');
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.access(config.dataDir, fs.constants.W_OK);
    return { dir: config.dataDir, writable: true };
  } catch (e) {
    return { dir: config.dataDir, writable: false, error: e instanceof Error ? e.message : String(e) };
  }
}
