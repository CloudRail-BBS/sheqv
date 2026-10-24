#!/usr/bin/env bash
# 一键起全栈：后端栈（db + api）→ 前端栈（web）
#
#   cd deploy && ./up.sh
#
# 两个栈的配置分别在 server/compose.yml 与 web/compose.yml，
# 本脚本只负责「按正确顺序起」并打印入口。

set -euo pipefail
cd "$(dirname "$0")"

SERVER_DIR="../server"
WEB_DIR="../web"

# 1) 后端 .env（数据库密码、会话密钥）
if [ ! -f "$SERVER_DIR/.env" ]; then
  # 数据卷已存在却要重新生成密码 → 卷里仍是旧密码，一启动就会认证失败。
  # 这种组合几乎总是误操作（删了 .env 重来，但没删卷），直接拦住比事后排查省事。
  if command -v docker >/dev/null 2>&1 && docker volume inspect blockarena-pgdata >/dev/null 2>&1; then
    cat >&2 <<'HINT'
!!! 数据卷 blockarena-pgdata 已存在，但 server/.env 不存在

如果现在生成新密码，卷里的 PostgreSQL 仍然用旧密码，api 会报
"password authentication failed for user arena"（POSTGRES_PASSWORD 只在首次 initdb 生效）。

二选一：
  A. 数据可以丢：docker volume rm blockarena-pgdata
  B. 要保留数据：先把 .env 里的密码改回当初初始化时用的值，再 ./up.sh
HINT
    exit 1
  fi

  echo "==> 未找到 server/.env，先生成"
  # 用 bash 显式执行：仓库在 Windows 上打过包时脚本可能丢了执行位，
  # 那种情况下 `./init-env.sh` 会 Permission denied，而 `bash xx.sh` 不受影响。
  bash "$SERVER_DIR/init-env.sh"
fi

# 2) 后端栈：db 与 api。它同时负责创建 blockarena-net 网络
#    旧版本默认端口是 18080；如果 .env 里还是它，变量会盖住 compose 的新默认值 8860。
if grep -qE '^API_HOST_PORT=18080[[:space:]]*$' "$SERVER_DIR/.env" 2>/dev/null; then
  echo "==> 注意：server/.env 里仍是 API_HOST_PORT=18080（旧默认值），本次仍会用 18080"
  echo "    改用 8860：把该行改成 API_HOST_PORT=8860，或删掉该行使用新默认值"
fi

#    先处理升级遗留：旧版把 web 也放在 blockarena 项目里，拆分后 web 归 blockarena-web，
#    同名容器会让 compose 报 "container name ... is already in use"。只清理这一个容器。
if command -v docker >/dev/null 2>&1 && docker inspect blockarena-web >/dev/null 2>&1; then
  OWNER="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' blockarena-web 2>/dev/null || true)"
  if [ -n "$OWNER" ] && [ "$OWNER" != "blockarena-web" ] && [ "$OWNER" != "<no value>" ]; then
    echo "==> 清理旧编排留下的 blockarena-web（原 project：$OWNER），否则同名容器会冲突"
    docker rm -f blockarena-web >/dev/null
  fi
fi

echo "==> 构建并启动后端（db + api）"
( cd "$SERVER_DIR" && docker compose up -d --build )

# 3) 等 api 健康。web 启动时不需要它，但页面渲染需要，早发现早报错
API_PORT="$(grep -E '^API_HOST_PORT=' "$SERVER_DIR/.env" 2>/dev/null | cut -d= -f2 || true)"
API_PORT="${API_PORT:-8860}"

echo "==> 等待 api 就绪（最多 90s）"
for i in $(seq 1 45); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
    echo "    api 已就绪"
    break
  fi

  # 第 5 次（约 10s）抓一次日志：api 反复重启时，与其等 90s 再让人猜，不如现在就定位
  if [ "$i" -eq 5 ]; then
    API_LOG="$( ( cd "$SERVER_DIR" && docker compose logs --tail 40 api ) 2>&1 || true )"
    if printf '%s' "$API_LOG" | grep -q 'password authentication failed'; then
      cat >&2 <<HINT
!!! api 连不上数据库：密码认证失败

原因：数据卷里的 PostgreSQL 是用**旧密码**初始化的。POSTGRES_PASSWORD 只在
首次 initdb 时生效，之后改 server/.env 不会改已存在的角色 arena。

二选一：
  A. 数据可以丢（全新部署就是这个情况）
     (cd server && docker compose down -v) && ./up.sh

  B. 要保留数据
     (cd server && docker compose exec db psql -U arena -d arena \\
        -c "ALTER USER arena PASSWORD '$(grep -E '^POSTGRES_PASSWORD=' "$SERVER_DIR/.env" | cut -d= -f2)';")
     然后 ./up.sh
HINT
      exit 1
    fi
    if printf '%s' "$API_LOG" | grep -q 'no such file or directory' \
       && printf '%s' "$API_LOG" | grep -q 'tini'; then
      echo "!!! 镜像里的 tini 路径不对，说明用的是旧缓存镜像：docker compose build --no-cache api" >&2
      exit 1
    fi
  fi

  if [ "$i" -eq 45 ]; then
    echo "    api 未在 90s 内就绪，仍然继续起 web；请跑 ./doctor.sh 看日志" >&2
  fi
  sleep 2
done

# 4) 前端栈
echo "==> 构建并启动前端（web）"
( cd "$WEB_DIR" && docker compose up -d --build )

# 5) 汇总
echo
echo "==> 后端"
( cd "$SERVER_DIR" && docker compose ps )
echo
echo "==> 前端"
( cd "$WEB_DIR" && docker compose ps )

cat <<INFO

访问入口（宿主机 8080 已被占用，api 走 $API_PORT）：
  健康检查  curl -s 127.0.0.1:$API_PORT/api/health
  站点      http://127.0.0.1:8900/
  建管理员  (cd server && docker compose exec api /usr/local/bin/arena-api create-admin --username ops --password '<强密码>')
  看日志    (cd server && docker compose logs -f api)   /   (cd web && docker compose logs -f web)
  起不来    ./doctor.sh
INFO
