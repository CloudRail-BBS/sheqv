# 基础镜像前缀：默认走 Docker Hub；国内服务器拉不到 docker.io 时传镜像站，
# 例如 `--build-arg REGISTRY=docker.m.daocloud.io/library/`
# （末尾要带 /library/，因为 rust / debian 都在官方 library 命名空间下）。
ARG REGISTRY=

# 构建层：需要 C 编译器（ring / aws-lc 这类依赖要编 C 代码）
FROM ${REGISTRY}rust:1-slim AS build
WORKDIR /app

# apt 源（可选）：Debian 官方源在国内常常卡到超时，传 mirror.aliyun.com 之类即可
ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null \
      || sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# 先只拷清单，利用 layer 缓存复用依赖编译结果
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release --locked

# 运行层：只要二进制，不装 curl（healthcheck 走 `arena-api healthcheck`）
FROM ${REGISTRY}debian:bookworm-slim

ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null \
      || sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && test -x /usr/bin/tini \
 && useradd --system --uid 1001 --no-create-home arena \
 && mkdir -p /data \
 && chown -R 1001:1001 /data

WORKDIR /app
COPY --from=build /app/target/release/arena-api /usr/local/bin/arena-api

ENV PORT=8080 \
    DATA_DIR=/data \
    RUST_LOG=info,arena_api=info

USER 1001
EXPOSE 8080
VOLUME ["/data"]

# tini 负责转发 SIGTERM，容器 stop 能优雅退出。
# ⚠️ Debian 的 tini 在 **/usr/bin/tini**；/usr/sbin/tini 不存在（那是常见写法错误，
#    运行时会报 exec: "/usr/sbin/tini": no such file or directory）。
#    Alpine 才在 /sbin/tini。上面 RUN 里的 `test -x` 会在构建期就拦住路径写错。
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["arena-api", "serve"]
