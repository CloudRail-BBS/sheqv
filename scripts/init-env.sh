#!/usr/bin/env bash
# 生成根目录 .env（给 docker compose 用）：随机 POSTGRES_PASSWORD + SESSION_SECRET
#
#   bash scripts/init-env.sh
#
# 已存在 .env 时**拒绝覆盖**（里面可能是线上密钥）。要换密码请手动改，
# 并同步 `ALTER USER arena PASSWORD '...'`。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${ENV_FILE:-$ROOT/.env}"

if [ -e "$TARGET" ]; then
  echo "已存在 $TARGET，未做任何修改。" >&2
  echo "  要重新生成：先备份并删除它，或手动编辑。" >&2
  exit 1
fi

rand_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('node:crypto').randomBytes($bytes).toString('hex'))"
  else
    echo "需要 openssl 或 node 之一来生成随机密钥" >&2
    exit 1
  fi
}

DB_PASS="$(rand_hex 16)"
SESSION="$(rand_hex 32)"

cat > "$TARGET" <<ENV
# 由 scripts/init-env.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
# 不要提交到版本库（.gitignore 已排除）
POSTGRES_PASSWORD=$DB_PASS
SESSION_SECRET=$SESSION
ADMIN_TOKEN=
PUBLIC_BASE_URL=
APP_VERSION=2026.10.24
ENV

chmod 600 "$TARGET" 2>/dev/null || true

echo "已生成 $TARGET"
echo "  数据库密码：已随机生成（16 字节）"
echo "  会话密钥：已随机生成（32 字节）"
echo
echo "下一步（都在仓库根目录）："
echo "  docker compose up -d --build"
echo "  docker compose exec api /usr/local/bin/arena-api create-admin --username ops --password '<强密码>'"
