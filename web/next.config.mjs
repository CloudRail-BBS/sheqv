/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  // 本地为了绕开文件删除守卫用独立目录；Docker 里固定 .next
  distDir: process.env.NEXT_DIST_DIR || '.dist',
  outputFileTracingRoot: process.cwd(),

  // 自托管：产出可独立运行的最小包（node server.js），镜像不需要 node_modules 全量
  output: 'standalone',

  // standalone 会遍历项目目录收集依赖；把历史产物与数据目录排除掉，
  // 否则本地几个 50–100MB 的旧 distDir 会让 "Collecting build traces" 卡住数分钟。
  outputFileTracingExcludes: {
    '*': [
      './.dist/**',
      './.rel/**',
      './.out*/**',
      './.dev*/**',
      './.sh*/**',
      './.data*/**',
      './backups/**',
      './.shots/**',
      './deploy/**',
      './scripts/**',
      './node_modules/.cache/**',
    ],
  },

  /**
   * `/api/*` 一律转发给后端（bootstrap 例外——它是前端契约，有实体路由，
   * filesystem 路由优先于 rewrites）。生产也可以交给 nginx，两者不冲突。
   */
  async rewrites() {
    const base = (process.env.API_BASE || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${base}/api/:path*` }];
  },

  // 反代后由 nginx/Caddy 终止 TLS，这里只补基础安全头
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
