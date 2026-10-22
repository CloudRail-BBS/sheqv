#!/usr/bin/env bash
# 账号链路冒烟：注册 → 会话 → 登录 → 头衔 → 登出
#
#   bash scripts/smoke-auth.sh http://127.0.0.1:8080
#
# 会往数据库里写一个临时账号（smoke+时间戳），**只对测试库跑**。
# 断言的是状态码与错误码——这两样是与前端、与旧 Node 版的契约。

set -u

BASE="${1:-http://127.0.0.1:8080}"
CURL=(curl -s --max-time 10)
# 用相对路径建临时目录：绝对路径在 Windows 上会触发文件守卫，且便于清理
mkdir -p .smoke
TMP="$(mktemp -d .smoke/run-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

expect() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
    printf '  ok   %s\n' "$name"
  else
    fail=$((fail + 1))
    printf '  FAIL %s  期望=%s 实际=%s\n' "$name" "$want" "$got"
  fi
}

jget() {
  python -c "
import json,sys
try:
    d=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception:
    print(''); raise SystemExit
cur=d
for k in sys.argv[2].split('.'):
    cur = cur.get(k) if isinstance(cur, dict) else None
print('' if cur is None else cur)
" "$1" "$2"
}

code() { printf '%s' "$1"; }

echo "== 0. 健康检查 =="
c=$("${CURL[@]}" -o "$TMP/health.json" -w '%{http_code}' "$BASE/api/health")
expect "健康检查 200" "$c" "200"
expect "数据库 ok" "$(jget "$TMP/health.json" checks.database)" "ok"

echo "== 1. 匿名状态 =="
c=$("${CURL[@]}" -o "$TMP/state0.json" -w '%{http_code}' "$BASE/api/v1/auth/state")
expect "状态接口 200" "$c" "200"
expect "匿名 user 为 null" "$(jget "$TMP/state0.json" user)" ""
expect "Cache-Control: no-store" \
  "$("${CURL[@]}" -D - -o /dev/null "$BASE/api/v1/auth/state" | grep -ci 'cache-control: no-store')" "1"

echo "== 2. 注册 =="
STAMP=$(date +%s)
USER="smoke$STAMP"
c=$("${CURL[@]}" -c "$TMP/jar" -o "$TMP/reg.json" -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$USER\",\"nickname\":\"冒烟$STAMP\",\"password\":\"smoke1234\"}")
expect "注册 201" "$c" "201"
expect "返回 ok" "$(jget "$TMP/reg.json" ok)" "True"

c=$("${CURL[@]}" -o "$TMP/dup.json" -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$USER\",\"nickname\":\"重复\",\"password\":\"smoke1234\"}")
expect "重复用户名 409" "$c" "409"
expect "错误码 username_taken" "$(jget "$TMP/dup.json" error)" "username_taken"

c=$("${CURL[@]}" -o "$TMP/bad.json" -w '%{http_code}' -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"${USER}x\",\"nickname\":\"弱\",\"password\":\"abcdefgh\"}")
expect "弱密码 422" "$c" "422"
expect "错误码 invalid_input" "$(jget "$TMP/bad.json" error)" "invalid_input"

echo "== 3. 会话 =="
c=$("${CURL[@]}" -b "$TMP/jar" -o "$TMP/state1.json" -w '%{http_code}' "$BASE/api/v1/auth/state")
expect "带 Cookie 取状态 200" "$c" "200"
expect "会话识别出用户名" "$(jget "$TMP/state1.json" user.username)" "$USER"

echo "== 4. 登录 =="
c=$("${CURL[@]}" -o "$TMP/badlogin.json" -w '%{http_code}' -X POST "$BASE/api/v1/auth/login" \
  -H 'content-type: application/json' -d "{\"username\":\"$USER\",\"password\":\"wrongpass1\"}")
expect "错误密码 401" "$c" "401"
expect "错误码 invalid_credentials" "$(jget "$TMP/badlogin.json" error)" "invalid_credentials"

c=$("${CURL[@]}" -c "$TMP/jar2" -o "$TMP/login.json" -w '%{http_code}' -X POST "$BASE/api/v1/auth/login" \
  -H 'content-type: application/json' -d "{\"username\":\"$USER\",\"password\":\"smoke1234\"}")
expect "正确密码 200" "$c" "200"
expect "返回 ok" "$(jget "$TMP/login.json" ok)" "True"

echo "== 5. 头衔 =="
c=$("${CURL[@]}" -b "$TMP/jar2" -o "$TMP/title.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/me" \
  -H 'content-type: application/json' -d '{"title":"测试员"}')
expect "改头衔 200" "$c" "200"
expect "头衔已生效" "$(jget "$TMP/title.json" user.title)" "测试员"

c=$("${CURL[@]}" -b "$TMP/jar2" -o "$TMP/reserved.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/me" \
  -H 'content-type: application/json' -d '{"title":"管理员"}')
expect "普通用户用保留头衔 422" "$c" "422"
expect "错误码 invalid_title" "$(jget "$TMP/reserved.json" error)" "invalid_title"

echo "== 6. 登出 =="
c=$("${CURL[@]}" -b "$TMP/jar2" -D "$TMP/logout.h" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/logout")
expect "登出 200" "$c" "200"
expect "清除 Cookie" "$(grep -ci 'max-age=0' "$TMP/logout.h")" "1"

echo
echo "通过 $pass 项，失败 $fail 项"
[ "$fail" -eq 0 ]
