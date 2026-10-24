#!/usr/bin/env bash
# 停止 / 清理全栈
#
#   ./down.sh            # 停容器，保留数据卷（下次 up 数据还在）
#   ./down.sh --purge    # 连数据卷一起删（**会丢数据库**）
#
# 顺序很重要：web 接在后端创建的外部网络 blockarena-net 上，
# 必须先停 web，否则后端 down 时网络删不掉，报
#   ! Network blockarena-net Resource is still in use

set -euo pipefail
cd "$(dirname "$0")"

SERVER_DIR="../server"
WEB_DIR="../web"

case "${1:-}" in
  "" ) PURGE=0 ;;
  --purge ) PURGE=1 ;;
  -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
  * ) echo "未知参数：$1（可用：--purge）" >&2; exit 2 ;;
esac

if [ "$PURGE" = "1" ]; then
  cat >&2 <<'WARN'
⚠️  --purge 会删除数据卷 blockarena-pgdata（数据库全部内容）。
    确认要重来再继续；3 秒后执行，Ctrl-C 可取消。
WARN
  sleep 3
fi

# 1) 前端先停：它连着后端创建的外部网络
echo "==> 停止前端（web）"
( cd "$WEB_DIR" && docker compose down ) || true

# 2) 后端
if [ "$PURGE" = "1" ]; then
  echo "==> 停止后端并删除数据卷（db + api）"
  ( cd "$SERVER_DIR" && docker compose down -v ) || true
else
  echo "==> 停止后端（db + api），保留数据卷"
  ( cd "$SERVER_DIR" && docker compose down ) || true
fi

# 3) 兜底清理：down -v 遇到「资源被占用」只会警告并跳过，不会失败退出
if command -v docker >/dev/null 2>&1; then
  if docker network inspect blockarena-net >/dev/null 2>&1; then
    USERS="$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' blockarena-net 2>/dev/null | tr -s ' ' || true)"
    if [ -z "${USERS// /}" ]; then
      echo "==> 删除残留网络 blockarena-net"
      docker network rm blockarena-net >/dev/null 2>&1 || true
    else
      echo "    网络 blockarena-net 仍被占用：$USERS" >&2
      echo "    这些容器不属于本编排，确认后手动 docker rm -f 再重跑" >&2
    fi
  fi

  if [ "$PURGE" = "1" ]; then
    for vol in blockarena-pgdata blockarena-session-secret; do
      if docker volume inspect "$vol" >/dev/null 2>&1; then
        echo "==> 删除卷 $vol"
        docker volume rm "$vol" >/dev/null 2>&1 || echo "    卷 $vol 仍被占用，先删容器再重试" >&2
      fi
    done
  fi
fi

echo
echo "==> 剩余 blockarena-* 容器"
docker ps -a --filter "name=blockarena-" --format '{{.Names}}\t{{.Status}}' 2>/dev/null || true

if [ "$PURGE" = "1" ]; then
  echo
  echo "==> 剩余 blockarena-* 卷"
  docker volume ls --filter "name=blockarena-" --format '{{.Name}}' 2>/dev/null || true
  echo "（空 = 已清干净，可以 ./up.sh 重新初始化）"
fi
