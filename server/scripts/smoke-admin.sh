#!/usr/bin/env bash
# 后台链路冒烟：鉴权 → 用户防锁死 → 设置 → 帖子 → 公约 → 公告 → 轮播 → 赞助
#
#   ADMIN_TOKEN=smoke-admin-token bash scripts/smoke-admin.sh http://127.0.0.1:8080
#
# 需要服务端以同一个 ADMIN_TOKEN 启动（应急通道的用例依赖它）。只对测试库跑。

set -u

BASE="${1:-http://127.0.0.1:8080}"
TOKEN="${ADMIN_TOKEN:-smoke-admin-token}"
CURL=(curl -s --max-time 10)
mkdir -p .smoke
TMP="$(mktemp -d .smoke/admin-XXXXXX)"
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

jget() {
  python -c "
import json,sys
try:
    d=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception:
    print(''); raise SystemExit
cur=d
for k in sys.argv[2].split('.'):
    if isinstance(cur, dict): cur=cur.get(k)
    elif isinstance(cur, list) and k.isdigit(): cur=cur[int(k)] if int(k)<len(cur) else None
    else: cur=None
print('' if cur is None else cur)
" "$1" "$2"
}

jlen() { python -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));print(len(d.get('items',[])))" "$1"; }

STAMP=$(date +%s)
A="boss$STAMP"; B="staff$STAMP"; PW="smoke1234"

echo "== 1. 准备两个账号 =="
"${CURL[@]}" -c "$TMP/a.jar" -o "$TMP/a.json" -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d "{\"username\":\"$A\",\"nickname\":\"站长$STAMP\",\"password\":\"$PW\"}"
"${CURL[@]}" -c "$TMP/b.jar" -o "$TMP/b.json" -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d "{\"username\":\"$B\",\"nickname\":\"成员$STAMP\",\"password\":\"$PW\"}"
AID=$(jget "$TMP/a.json" user.id)
BID=$(jget "$TMP/b.json" user.id)
expect "两个账号建好" "$(printf '%s%s' "$AID" "$BID" | wc -c | tr -d ' ')" "26"

# 测试库可能已有账号，新注册的 A 不一定是首个用户；用应急口令把它提成管理员，
# 顺带验证「无会话也能操作，但仍受防锁死规则约束」这条通道。
c=$("${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o /dev/null -w '%{http_code}' \
  -X PATCH "$BASE/api/v1/admin/users" -H 'content-type: application/json' \
  -d "{\"id\":\"$AID\",\"role\":\"admin\"}")
expect "应急口令提权 A 200" "$c" "200"

# 测试库可能还留着别的管理员，会让「最后一个管理员」用例失真：
# 反复清理到只剩 A（最多 3 轮，防单轮漏网）。仅测试库可这么做。
for _ in 1 2 3; do
  "${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o "$TMP/all.json" "$BASE/api/v1/admin/users"
  python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
for u in d['items']:
    if u['role']=='admin' and u['id']!=sys.argv[2]:
        print(u['id'])
" "$TMP/all.json" "$AID" > "$TMP/others.txt"
  [ -s "$TMP/others.txt" ] || break
  while read -r OTHER; do
    OTHER="${OTHER%$'\r'}"   # python 在 Windows 写文件会带 CRLF，必须去掉
    [ -z "$OTHER" ] && continue
    "${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o /dev/null -X PATCH "$BASE/api/v1/admin/users" \
      -H 'content-type: application/json' -d "{\"id\":\"$OTHER\",\"role\":\"member\"}"
  done < "$TMP/others.txt"
done

echo "== 2. 鉴权三态 =="
c=$("${CURL[@]}" -o "$TMP/u1.json" -w '%{http_code}' "$BASE/api/v1/admin/users")
expect "匿名 401" "$c" "401"
expect "错误码 unauthorized" "$(jget "$TMP/u1.json" error)" "unauthorized"
expect "带 WWW-Authenticate" "$("${CURL[@]}" -D - -o /dev/null "$BASE/api/v1/admin/users" | grep -ci 'www-authenticate')" "1"

c=$("${CURL[@]}" -b "$TMP/b.jar" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
expect "普通成员 401" "$c" "401"

c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/u2.json" -w '%{http_code}' "$BASE/api/v1/admin/users")
expect "管理员 200" "$c" "200"
expect "列表至少两个账号" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print('yes' if len(d['items']) >= 2 else 'no')
" "$TMP/u2.json")" "yes"

c=$("${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
expect "应急口令 Bearer 200" "$c" "200"
c=$("${CURL[@]}" -H "Authorization: Bearer wrong" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
expect "错口令 401" "$c" "401"

echo "== 3. 防锁死 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/self.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/users" \
  -H 'content-type: application/json' -d "{\"id\":\"$AID\",\"role\":\"member\"}")
expect "改自己角色 403" "$c" "403"
expect "错误码 self_forbidden" "$(jget "$TMP/self.json" error)" "self_forbidden"

c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/promote.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/users" \
  -H 'content-type: application/json' -d "{\"id\":\"$BID\",\"role\":\"admin\"}")
expect "提成员为管理员 200" "$c" "200"
expect "角色已变" "$(jget "$TMP/promote.json" user.role)" "admin"

c=$("${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o "$TMP/last.json" -w '%{http_code}' \
  -X PATCH "$BASE/api/v1/admin/users" -H 'content-type: application/json' \
  -d "{\"id\":\"$BID\",\"role\":\"member\"}")
expect "降权（还剩 A）200" "$c" "200"

ADMIN_COUNT=$("${CURL[@]}" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/users" | python -c "
import json,sys
print(json.load(sys.stdin)['adminCount'])
")
if [ "$ADMIN_COUNT" = "1" ]; then
  c=$("${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o "$TMP/last2.json" -w '%{http_code}' \
    -X PATCH "$BASE/api/v1/admin/users" -H 'content-type: application/json' \
    -d "{\"id\":\"$AID\",\"role\":\"member\"}")
  expect "降权最后一个管理员 409" "$c" "409"
  expect "错误码 last_admin" "$(jget "$TMP/last2.json" error)" "last_admin"
else
  echo "  skip 降权最后一个管理员（当前管理员数=$ADMIN_COUNT，非隔离环境）"
fi

c=$("${CURL[@]}" -H "Authorization: Bearer $TOKEN" -o "$TMP/bantitle.json" -w '%{http_code}' \
  -X PATCH "$BASE/api/v1/admin/users" -H 'content-type: application/json' \
  -d "{\"id\":\"$BID\",\"title\":\"管理员\"}")
expect "给成员设保留头衔 422" "$c" "422"

echo "== 4. 设置 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/s1.json" -w '%{http_code}' "$BASE/api/v1/admin/settings")
expect "读设置 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/s2.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/settings" \
  -H 'content-type: application/json' -d '{"siteName":"冒烟站"}')
expect "改站点名 200" "$c" "200"
expect "新名字生效" "$(jget "$TMP/s2.json" settings.siteName)" "冒烟站"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/s3.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/settings" \
  -H 'content-type: application/json' -d '{"resetKey":"siteName"}')
expect "恢复默认 200" "$c" "200"
expect "回落到默认名" "$(jget "$TMP/s3.json" settings.siteName)" "方块竞技场"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/s4.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/settings" \
  -H 'content-type: application/json' -d '{"logoText":"三个字"}')
expect "标识超长 422" "$c" "422"

echo "== 5. 帖子管理 =="
"${CURL[@]}" -b "$TMP/a.jar" -c "$TMP/a.jar" -o /dev/null -X POST "$BASE/api/v1/agreements/sign" \
  -H 'content-type: application/json' -d '{"id":"community"}'
"${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/p.json" -X POST "$BASE/api/v1/posts" \
  -H 'content-type: application/json' -d "{\"title\":\"待删帖 $STAMP\",\"body\":\"这条帖子会被后台删除，用于验证级联。\"}"
PID=$(grep -o '"id":"p[^"]*"' "$TMP/p.json" | head -1 | sed 's/.*:"//;s/"//')

c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/pl.json" -w '%{http_code}' "$BASE/api/v1/admin/posts")
expect "后台帖子列表 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/posts?id=$PID")
expect "删帖 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/posts?id=$PID")
expect "重复删除 404" "$c" "404"

echo "== 6. 公告 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/an.json" -w '%{http_code}' -X POST "$BASE/api/v1/admin/announcements" \
  -H 'content-type: application/json' -d "{\"title\":\"冒烟公告 $STAMP\",\"body\":\"这是一条公告正文。\",\"kind\":\"system\"}")
expect "发公告 201" "$c" "201"
ANID=$(jget "$TMP/an.json" item.id)
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/an2.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/announcements" \
  -H 'content-type: application/json' -d "{\"id\":\"$ANID\",\"pinned\":true}")
expect "置顶 200" "$c" "200"
expect "pinned 生效" "$(jget "$TMP/an2.json" item.pinned)" "True"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/announcements?id=$ANID")
expect "删公告 200" "$c" "200"

echo "== 7. 轮播 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/sl.json" -w '%{http_code}' -X POST "$BASE/api/v1/admin/slides" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"冒烟轮播 $STAMP\",\"desc\":\"描述\",\"cta\":\"查看\",\"href\":\"javascript:alert(1)\",\"bgColor\":\"red\"}")
expect "建轮播 201" "$c" "201"
SLID=$(jget "$TMP/sl.json" item.id)
expect "危险 href 被收敛为 /" "$(jget "$TMP/sl.json" item.href)" "/"
expect "非法颜色回落默认" "$(jget "$TMP/sl.json" item.bgColor)" "#1b1b1e"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/slides?id=$SLID")
expect "删轮播 200" "$c" "200"

echo "== 8. 赞助 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/sponsors")
expect "赞助快照 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/sp.json" -w '%{http_code}' -X POST "$BASE/api/v1/admin/sponsors" \
  -H 'content-type: application/json' -d '{"name":"手动赞助者","amount":"66.50"}')
expect "手动录入 201" "$c" "201"
SPID=$(jget "$TMP/sp.json" item.id)
expect "金额保留两位" "$(jget "$TMP/sp.json" item.amount)" "66.5"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/sp2.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/sponsors" \
  -H 'content-type: application/json' -d "{\"id\":\"$SPID\",\"hidden\":true}")
expect "隐藏 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/sponsors?id=$SPID")
expect "删手动条目 200" "$c" "200"

c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/af.json" -w '%{http_code}' -X POST "$BASE/api/v1/admin/afdian/sync")
expect "未配爱发电时同步 400" "$c" "400"
expect "错误码 afdian_not_configured" "$(jget "$TMP/af.json" error)" "afdian_not_configured"

echo "== 9. 公约后台 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/ag.json" -w '%{http_code}' -X POST "$BASE/api/v1/admin/agreements" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"冒烟公约\",\"version\":\"v1\",\"scope\":\"测试\",\"summary\":\"简介\",\"gate\":\"限制\",\"clauses\":[{\"h\":\"条款\",\"p\":\"内容\"}]}")
expect "新增公约 201" "$c" "201"
AGID=$(jget "$TMP/ag.json" item.id)
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/agreements" \
  -H 'content-type: application/json' -d "{\"id\":\"$AGID\",\"active\":false}")
expect "停用 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/lock.json" -w '%{http_code}' -X PATCH "$BASE/api/v1/admin/agreements" \
  -H 'content-type: application/json' -d '{"id":"community","active":false}')
expect "内置公约锁定 403" "$c" "403"
expect "错误码 builtin_locked" "$(jget "$TMP/lock.json" error)" "builtin_locked"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/agreements?id=$AGID")
expect "删除自定义公约 200" "$c" "200"
c=$("${CURL[@]}" -b "$TMP/a.jar" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/admin/agreements?id=trust")
expect "删内置公约 403" "$c" "403"

echo
echo "通过 $pass 项，失败 $fail 项"
[ "$fail" -eq 0 ]
