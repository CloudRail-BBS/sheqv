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
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

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

USER nextjs
EXPOSE 8900
VOLUME ["/data"]

# tini 负责回收僵尸进程与转发 SIGTERM，容器 stop 能优雅退出
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8900)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
