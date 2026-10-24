#!/usr/bin/env bash
# 从 dump 恢复（**会覆盖当前库**，必须先加 --yes）
#
#   DATABASE_URL=... bash scripts/restore.sh backups/arena-20261024-030000.dump --yes
#
# 恢复前会自动先备份一次当前状态到 backups/pre-restore-*.dump，
# 万一恢复错了还能回去。

set -euo pipefail

FILE="${1:-}"
YES="${2:-}"
[ -n "$FILE" ] || { echo "用法：restore.sh <dump 文件> --yes" >&2; exit 2; }
[ -f "$FILE" ] || { echo "找不到文件：$FILE" >&2; exit 2; }
if [ "$YES" != "--yes" ]; then
  cat >&2 <<'WARN'
⚠️  这会用备份覆盖当前数据库（表结构与数据都会被替换）。
    确认无误后重跑并加上 --yes。
WARN
  exit 3
fi

: "${DATABASE_URL:?请设置 DATABASE_URL}"

echo "==> 先给当前库做一次安全备份"
bash "$(dirname "$0")/backup.sh" --dir "${BACKUP_DIR:-./backups}" >/dev/null
SAFE="$(ls -1t "${BACKUP_DIR:-./backups}"/arena-*.dump | head -1)"
echo "    已保存：$SAFE"

echo "==> 恢复 $FILE"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$FILE"

echo "==> 恢复完成；如需回滚：restore.sh $SAFE --yes"
