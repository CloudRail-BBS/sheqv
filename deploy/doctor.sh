#!/usr/bin/env bash
# 起不来时先跑这个：两个栈的状态 + 健康 + 日志 + 常见原因
#
#   cd deploy && ./doctor.sh

set -uo pipefail
cd "$(dirname "$0")"

SERVER_DIR="../server"
WEB_DIR="../web"

echo "== 容器状态 =="
echo "--- 后端（server/compose.yml）---"
( cd "$SERVER_DIR" && docker compose ps -a ) || true
echo "--- 前端（web/compose.yml）---"
( cd "$WEB_DIR" && docker compose ps -a ) || true

echo
echo "== 健康详情 =="
for name in blockarena-db blockarena-api blockarena-web; do
  if docker inspect "$name" >/dev/null 2>&1; then
    printf '%-20s %s\n' "$name" \
      "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name")"
  else
    printf '%-20s %s\n' "$name" "不存在"
  fi
done

echo
echo "== db 日志（最后 60 行）=="
( cd "$SERVER_DIR" && docker compose logs --tail 60 db ) 2>&1 | tail -60 || true

echo
echo "== api 日志（最后 40 行）=="
( cd "$SERVER_DIR" && docker compose logs --tail 40 api ) 2>&1 | tail -40 || true

echo
echo "== web 日志（最后 30 行）=="
( cd "$WEB_DIR" && docker compose logs --tail 30 web ) 2>&1 | tail -30 || true

cat <<'HINT'

== 常见原因 ==
1) api 反复重启，日志里 "password authentication failed for user arena"  ← 最常见
   → 数据卷里的 PostgreSQL 是用**旧密码**初始化的。POSTGRES_PASSWORD 只在首次
     initdb 时生效，之后改 server/.env 不会改已存在的角色 arena。
     确认卷的密码改不了了，二选一：
       数据可丢： (cd server && docker compose down -v) && ./up.sh
       要保留：   (cd server && docker compose exec db psql -U arena -d arena \
                     -c "ALTER USER arena PASSWORD '新密码';")
     注意：`docker compose down` 不加 -v 不会删卷，所以问题会一直复现。

2) db 立刻退出，日志里 "database files are incompatible with server" 或
   "the data directory was initialized by PostgreSQL version ..."
   → 数据卷是别的 PG 版本建的（例如 18 与 17 的 PGDATA 布局不同）。
     确认可以丢数据后重建： (cd server && docker compose down -v) && ./up.sh
     不能丢数据就先用同版本镜像起来做 pg_dump。

3) db 日志 "initdb: directory ... exists but is not empty"
   → 挂载点与 PGDATA 不一致，server/compose.yml 已显式设 PGDATA，确认没改过它。

4) exec: "/usr/bin/tini": no such file or directory（或 /usr/sbin/tini）
   → 镜像 ENTRYPOINT 路径与发行版不符：Debian 是 /usr/bin/tini，Alpine 是 /sbin/tini。
     本仓库已修，两个 Dockerfile 都加了 `test -x` 构建期自检。
     仍出现说明用的是旧缓存镜像： (cd server && docker compose build --no-cache api) && ./up.sh

5) web 报 "network blockarena-net declared as external, but could not be found"
   → 后端栈没起（网络由它创建）。先 `(cd server && docker compose up -d)`。

6) 宿主机端口冲突
   → api 只发布在 127.0.0.1:${API_HOST_PORT:-8860}，不占 8080；web 是 8900。
     看占用：ss -ltnp | grep -E '8860|8900'
HINT
