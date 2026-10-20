#!/usr/bin/env bash
# 备份 / 恢复数据卷（论坛 + 公约）
#
#   ./deploy/backup.sh backup            # 打成 backups/blockarena-YYYYmmdd-HHMMSS.tar.gz
#   ./deploy/backup.sh backup 14         # 同上，并只保留最近 14 份
#   ./deploy/backup.sh restore <file>    # 从备份恢复
#
# 依赖：docker compose 已在项目目录可用

set -euo pipefail

SERVICE="web"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$DIR/backups"
ACTION="${1:-backup}"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker；裸机部署请直接打包 DATA_DIR：" >&2
  echo "  tar czf blockarena-\$(date +%F).tar.gz -C \"\$DATA_DIR\" ." >&2
  exit 1
fi

compose() { (cd "$DIR" && docker compose "$@"); }

case "$ACTION" in
  backup)
    keep="${2:-30}"
    mkdir -p "$OUT"
    stamp="$(date +%Y%m%d-%H%M%S)"
    file="$OUT/blockarena-$stamp.tar.gz"

    compose ps --status running --quiet "$SERVICE" >/dev/null 2>&1 || {
      echo "容器未运行，无法热备份" >&2
      exit 1
    }

    # 数据目录很小（纯 JSON），直接流式打包，不需要停服
    compose exec -T "$SERVICE" tar czf - -C /data . > "$file"
    size="$(du -h "$file" | cut -f1)"
    echo "已备份 → $file（$size）"

    # 滚动清理：按文件名排序删旧的
    ls -1t "$OUT"/blockarena-*.tar.gz 2>/dev/null | tail -n +$((keep + 1)) | while read -r old; do
      rm -f "$old"
      echo "清理旧备份：$(basename "$old")"
    done
    ;;

  restore)
    src="${2:-}"
    [ -n "$src" ] || { echo "用法：$0 restore <备份文件>" >&2; exit 1; }
    [ -f "$src" ] || { echo "文件不存在：$src" >&2; exit 1; }

    echo "将清空 /data 并从 $src 恢复。5 秒内 Ctrl-C 取消…"
    sleep 5

    compose exec -T "$SERVICE" sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null || true'
    compose exec -T "$SERVICE" tar xzf - -C /data < "$src"
    compose restart "$SERVICE"
    echo "恢复完成，已重启。"
    ;;

  *)
    echo "用法：$0 {backup [保留份数] | restore <文件>}" >&2
    exit 1
    ;;
esac
