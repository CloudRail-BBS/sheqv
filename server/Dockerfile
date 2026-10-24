# 构建层：需要 C 编译器（ring / aws-lc 这类依赖要编 C 代码）
FROM rust:1-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# 先只拷清单，利用 layer 缓存复用依赖编译结果
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release --locked

# 运行层：只要二进制，不装 curl（healthcheck 走 `arena-api healthcheck`）
FROM debian:bookworm-slim

RUN apt-get update \
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
