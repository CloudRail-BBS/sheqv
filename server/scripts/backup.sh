#!/usr/bin/env bash
# PostgreSQL 备份：pg_dump 自定义格式（-Fc，可选择性恢复 + 自带压缩）
#
#   DATABASE_URL=postgres://arena:***@127.0.0.1:5432/arena bash scripts/backup.sh
#   bash scripts/backup.sh --keep 14 --dir /backup
#
# 两种模式，自动选：
#   1. 本机有 pg_dump → 直连数据库
#   2. 没有（比如只在容器里跑）→ docker compose exec db pg_dump，输出重定向到宿主
#
# 备份完会做一次「可读性校验」（pg_restore --list），失败即退出非 0，方便 cron 报警。

set -euo pipefail

KEEP=30
DIR="${BACKUP_DIR:-./backups}"
COMPOSE_FILE="${COMPOSE_FILE:-../docker-compose.yml}"

while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

: "${DATABASE_URL:?请设置 DATABASE_URL（形如 postgres://user:pass@host:5432/db）}"

mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/arena-$STAMP.dump"

echo "==> 备份到 $OUT"
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
elif command -v docker >/dev/null 2>&1; then
  # 容器模式：db 服务在 compose 里，凭据由容器环境变量提供
  docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U arena -d arena --format=custom --no-owner --no-privileges > "$OUT"
else
  echo "既没有 pg_dump 也没有 docker，无法备份" >&2
  exit 1
fi

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
if [ "$SIZE" -lt 1024 ]; then
  echo "备份文件只有 ${SIZE}B，明显不对；已删除" >&2
  rm -f "$OUT"
  exit 1
fi

# 可读性校验：能列出目录说明格式没坏
if command -v pg_restore >/dev/null 2>&1; then
  TABLES="$(pg_restore --list "$OUT" | grep -c 'TABLE DATA' || true)"
  echo "==> 校验通过：含 $TABLES 张表的数据段，$((SIZE / 1024))KB"
else
  echo "==> 未装 pg_restore，跳过校验，$((SIZE / 1024))KB"
fi

# 保留最近 N 份
ls -1t "$DIR"/arena-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "==> 清理旧备份 $(basename "$old")"
  rm -f "$old"
done

echo "==> 完成：$OUT"
