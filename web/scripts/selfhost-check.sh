#!/usr/bin/env bash
# 自托管部署体检：部署完跑一遍，确认不是"起来了但不可用"
#
#   bash scripts/selfhost-check.sh https://arena.example.com
#   ADMIN_TOKEN=xxx bash scripts/selfhost-check.sh http://127.0.0.1:3000
#
# 退出码非 0 表示有失败项。

set -uo pipefail

BASE="${1:-http://127.0.0.1:3000}"
BASE="${BASE%/}"
PASS=0
FAIL=0
WARN=0

ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
warn() { WARN=$((WARN+1)); printf '  \033[33m!\033[0m %s\n' "$1"; }

code() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$@"; }

echo "体检目标：$BASE"
echo

echo "[1] 存活与数据目录"
health="$(curl -s -m 15 "$BASE/api/health" || true)"
hcode="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$BASE/api/health" || true)"
if [ "$hcode" = "200" ]; then
  ok "/api/health 200"
  echo "$health" | grep -q '"ok":true' && ok "ok=true" || bad "ok 不为 true（数据目录不可写？）"
  echo "$health" | grep -q '"dataDir":"ok"' && ok "dataDir 可写" || bad "dataDir 不可写"
else
  bad "/api/health 返回 $hcode"
fi

echo
echo "[2] 关键页面"
for p in / /agreements /guilds /teams /leaderboard /matches /announcements /me /notifications; do
  c="$(code "$BASE$p")"
  [ "$c" = "200" ] && ok "$p" || bad "$p → $c"
done

echo
echo "[3] 对外地址（不应出现 example 占位域名）"
boot="$(curl -s -m 15 "$BASE/api/v1/bootstrap" || true)"
if echo "$boot" | grep -q '\.example'; then
  bad "bootstrap 里仍有 example 域名，检查 PUBLIC_BASE_URL / WS_URL / CDN_BASE"
else
  ok "endpoints 未使用占位域名"
fi
echo "$boot" | grep -q '"runtime":"web"' && ok "runtime=web" || bad "runtime 异常"
echo "$boot" | grep -q '"form":"' && ok "form 已下发" || bad "缺少 form 字段"

echo
echo "[4] 调试页是否已关闭（生产应为 404）"
c="$(code "$BASE/dev/capabilities")"
if [ "$c" = "404" ]; then
  ok "/dev/capabilities 已关闭"
elif [ "$c" = "200" ]; then
  warn "/dev/capabilities 仍开放（ENABLE_DEV_CONSOLE=1？仅在排障时开启）"
else
  ok "/dev/capabilities → $c"
fi

echo
echo "[5] 账号与后台鉴权"
state="$(curl -s -m 15 "$BASE/api/v1/auth/state" || true)"
echo "$state" | grep -q '"initialized"' && ok "auth/state 可用" || bad "auth/state 异常"
users="$(echo "$state" | grep -o '"userCount":[0-9]*' | sed 's/.*://')"
if [ "${users:-0}" = "0" ]; then
  warn "还没有任何账号：访问 /register 注册，第一个账号将成为管理员"
else
  ok "已有 $users 个账号"
fi

c="$(code "$BASE/api/v1/admin/agreements")"
[ "$c" = "401" ] && ok "无凭据访问 admin API 被拒（401）" || bad "无凭据访问 admin API 返回 $c，应该 401"

page="$(curl -s -m 15 "$BASE/admin" || true)"
if echo "$page" | grep -q '后台需要登录'; then
  ok "/admin 未登录时显示登录引导"
elif echo "$page" | grep -q '管理后台'; then
  warn "/admin 直接返回后台内容（Cookie 未带，通常不应出现）"
else
  bad "/admin 未正确拦截未登录访问"
fi

if [ -n "${ADMIN_TOKEN:-}" ]; then
  c="$(code -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/v1/admin/agreements")"
  [ "$c" = "200" ] && ok "应急口令可访问（200）" || bad "应急口令返回 $c"
  c="$(code -H "Authorization: Bearer wrong-token" "$BASE/api/v1/admin/agreements")"
  [ "$c" = "401" ] && ok "错误口令被拒（401）" || bad "错误口令返回 $c"
else
  ok "未配置 ADMIN_TOKEN（应急通道关闭，按角色鉴权）"
fi

echo
echo "[6] 响应头与缓存"
hdr="$(curl -s -I -m 15 "$BASE/" || true)"
echo "$hdr" | grep -qi 'x-content-type-options: *nosniff' && ok "nosniff" || warn "缺少 X-Content-Type-Options"
echo "$hdr" | grep -qi 'x-frame-options' && ok "X-Frame-Options" || warn "缺少 X-Frame-Options"
echo "$hdr" | grep -qi 'x-powered-by' && warn "暴露了 X-Powered-By" || ok "未暴露 X-Powered-By"

# HTML 必须是私有缓存：页面按 UA 渲染，一旦被共享缓存存下来就会串形态。
# 满足 private/no-store 时 CDN 不会缓存 HTML，Vary 交给 Next 自己管（它写入 RSC 相关值）。
if echo "$hdr" | grep -qi 'cache-control:.*\(private\|no-store\)'; then
  ok "HTML 为 private/no-store（共享缓存不命中）"
else
  warn "HTML 可能被共享缓存，需确认 Vary 含 User-Agent"
fi

# 静态资源应可长缓存（文件名带哈希）
css_path="$(curl -s -m 15 "$BASE/" | grep -o '/_next/static/css/[^"]*\.css' | head -1)"
if [ -n "$css_path" ]; then
  css_hdr="$(curl -s -I -m 15 "$BASE$css_path" || true)"
  if echo "$css_hdr" | grep -qi 'cache-control:.*\(max-age=[0-9]\{5,\}\|immutable\)'; then
    ok "静态资源长缓存"
  else
    warn "静态资源未设长缓存（反代或 CDN 可加）"
  fi
fi

echo
echo "结果：$PASS 通过 / $FAIL 失败 / $WARN 提醒"
[ "$FAIL" -eq 0 ] || exit 1
