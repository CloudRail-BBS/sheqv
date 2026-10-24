# 依赖层：只装生产 + 构建依赖，利用 layer 缓存
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 构建层
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_DIST_DIR=.next \
    NODE_ENV=production

# ⚠️ rewrites 在**构建时**就固化成绝对地址，写进 .next/routes-manifest.json。
# 这里不给 API_BASE 的话会落回 next.config.mjs 的默认值 127.0.0.1:8080，
# 而容器里的 127.0.0.1 是 web 自己（api 在另一个容器）——
# 浏览器发出的 /api/* 会全部失败（Next 返回 500），表现为「注册/登录失败」。
# 注意：运行时改 environment.API_BASE **不会**影响已固化的 rewrites，必须重建。
ARG API_BASE=http://api:8080
ENV API_BASE=${API_BASE}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 记下构建时用的地址，start.mjs 在启动时与运行时 API_BASE 比对，不一致就告警
RUN printf '%s' "$API_BASE" > .build-api-base \
 && npm run build

# 运行层：只带 standalone 产物
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8900 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    TZ=Asia/Shanghai

RUN apk add --no-cache tini \
 && test -x /sbin/tini \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 \
 && mkdir -p /data \
 && chown -R nextjs:nodejs /data /app

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# 构建期的 API_BASE，仅用于启动自检（见 start.mjs）
COPY --from=build --chown=nextjs:nodejs /app/.build-api-base ./.build-api-base
# 启动包装器：读 .env、比对构建期 API_BASE、转发 SIGTERM（与本地 npm start 同一套逻辑）。
# 两个文件放根目录，start.mjs 里的 './load-env.mjs' 相对导入正好对上。
COPY --from=build --chown=nextjs:nodejs /app/scripts/start.mjs ./start.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/load-env.mjs ./load-env.mjs

USER nextjs
EXPOSE 8900
VOLUME ["/data"]

# tini 负责回收僵尸进程与转发 SIGTERM，容器 stop 能优雅退出
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "start.mjs", "--standalone"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8900)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
