#!/usr/bin/env bash
# 一键起服务：缺 .env 就先生成，再 build + up，最后打印各端口
#
#   cd deploy && ./up.sh

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "==> 未找到 deploy/.env，先生成"
  # 用 bash 显式执行：仓库在 Windows 上打过包时脚本可能丢了执行位，
  # 那种情况下 `./init-env.sh` 会 Permission denied，而 `bash xx.sh` 不受影响。
  bash ./init-env.sh
fi

echo "==> 构建并启动（首次会比较慢）"
docker compose up -d --build

echo "==> 当前状态"
docker compose ps

API_PORT="$(grep -E '^API_HOST_PORT=' .env | cut -d= -f2 || true)"
API_PORT="${API_PORT:-18080}"

cat <<INFO

访问入口（宿主机 8080 已被占用，api 走 $API_PORT）：
  健康检查  curl -s 127.0.0.1:$API_PORT/api/health
  站点      http://127.0.0.1:8900/
  建管理员  docker compose exec api /usr/local/bin/arena-api create-admin --username ops --password '<强密码>'
  看日志    docker compose logs -f api
  起不来    ./doctor.sh
INFO
