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

# tini 负责转发 SIGTERM，容器 stop 能优雅退出
ENTRYPOINT ["/usr/sbin/tini", "--"]
CMD ["arena-api", "serve"]
