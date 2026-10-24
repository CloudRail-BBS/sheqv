#!/usr/bin/env bash
# 第三方登录冒烟：不走真实平台，只验证「发起 → 状态校验 → 错误分支」。
#
#   ADMIN_TOKEN=smoke-admin-token bash scripts/smoke-oauth.sh http://127.0.0.1:8080
#
# 会临时写入假的 GitHub 凭据，跑完会清掉。只对测试库跑。

set -u

BASE="${1:-http://127.0.0.1:8080}"
TOKEN="${ADMIN_TOKEN:-smoke-admin-token}"
CURL=(curl -s --max-time 10)
mkdir -p .smoke
TMP="$(mktemp -d .smoke/oauth-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0
expect() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1)); printf '  ok   %s\n' "$name"
  else
    fail=$((fail + 1)); printf '  FAIL %s  期望=%s 实际=%s\n' "$name" "$want" "$got"
  fi
}

loc() { grep -i '^location:' "$1" | tr -d '\r' | sed 's/^[Ll]ocation: *//'; }
reset_key() {
  "${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o /dev/null -X PATCH "$BASE/api/v1/admin/settings" \
    -H 'content-type: application/json' -d "{\"resetKey\":\"$1\"}"
}

echo "== 1. 未配置时 =="
reset_key githubClientId; reset_key githubClientSecret
"${CURL[@]}" -o /dev/null -D "$TMP/h1" "$BASE/api/v1/auth/oauth/github"
expect "未配置 → provider_disabled" "$(loc "$TMP/h1")" "$BASE/login?error=provider_disabled&provider=github"

"${CURL[@]}" -o /dev/null -D "$TMP/h2" "$BASE/api/v1/auth/oauth/weibo"
expect "未知 provider" "$(loc "$TMP/h2")" "$BASE/login?error=unknown_provider"

echo "== 2. 配好凭据后发起授权 =="
"${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o /dev/null -X PATCH "$BASE/api/v1/admin/settings" \
  -H 'content-type: application/json' -d '{"githubClientId":"fake-client-id","githubClientSecret":"fake-secret"}'

"${CURL[@]}" -o /dev/null -D "$TMP/h3" -c "$TMP/jar" "$BASE/api/v1/auth/oauth/github"
TARGET="$(loc "$TMP/h3")"
expect "跳转到 GitHub 授权页" "$(printf '%s' "$TARGET" | grep -c '^https://github.com/login/oauth/authorize')" "1"
expect "带 PKCE S256" "$(printf '%s' "$TARGET" | grep -c 'code_challenge_method=S256')" "1"
expect "带 state" "$(printf '%s' "$TARGET" | grep -c 'state=')" "1"
expect "写 oauth_state Cookie" "$(grep -ci 'oauth_state=github\.' "$TMP/h3")" "1"
expect "写 oauth_pkce Cookie" "$(grep -ci 'oauth_pkce=github\.' "$TMP/h3")" "1"
expect "Cookie 是 HttpOnly" "$(grep -ci 'httponly' "$TMP/h3")" "2"

echo "== 3. 回调校验 =="
"${CURL[@]}" -o /dev/null -D "$TMP/h4" -b "$TMP/jar" "$BASE/api/v1/auth/oauth/github/callback?code=abc&state=wrong"
expect "state 不匹配" "$(loc "$TMP/h4")" "$BASE/login?error=state_mismatch"

"${CURL[@]}" -o /dev/null -D "$TMP/h5" "$BASE/api/v1/auth/oauth/github/callback?error=access_denied"
expect "平台拒绝授权" "$(loc "$TMP/h5")" "$BASE/login?error=access_denied"

"${CURL[@]}" -o /dev/null -D "$TMP/h6" "$BASE/api/v1/auth/oauth/github/callback?code=abc"
expect "缺 state" "$(loc "$TMP/h6")" "$BASE/login?error=state_mismatch"

echo "== 4. 清理 =="
reset_key githubClientId; reset_key githubClientSecret

echo
echo "通过 $pass 项，失败 $fail 项"
[ "$fail" -eq 0 ]
