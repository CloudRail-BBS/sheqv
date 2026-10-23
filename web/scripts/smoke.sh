#!/usr/bin/env bash
# 冒烟：端能力 + 账号 + 权限 + 公约 + 后台
#
#   bash scripts/smoke.sh [base-url]
#   ADMIN_TOKEN=xxx bash scripts/smoke.sh        # 目标环境配了应急口令时
#
# 建议对**空的数据目录**跑一次，能完整验证"第一个注册用户成为管理员"。
# 数据目录非空时，该条断言自动降级为"后注册的一定是成员"。
set -uo pipefail

BASE="${1:-http://localhost:8900}"
BASE="${BASE%/}"

UA_DESK='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
UA_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
UA_WX='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.44'

STAMP="$(date +%s)"
U1="smoke_a$STAMP"
U2="smoke_b$STAMP"
N1="冒烟甲$STAMP"
N2="冒烟乙$STAMP"
PW="Smoke2026pw"

pass=0; fail=0; skip=0
expect() {
  local name="$1" actual="$2" want="$3"
  if [ "$actual" = "$want" ]; then
    printf '  PASS  %-40s %s\n' "$name" "$actual"; pass=$((pass+1))
  else
    printf '  FAIL  %-40s got=%s want=%s\n' "$name" "$actual" "$want"; fail=$((fail+1))
  fi
}
skipped() { printf '  SKIP  %-40s %s\n' "$1" "$2"; skip=$((skip+1)); }
has() { [ "$(grep -c "$1" "$2")" -ge 1 ] && echo yes || echo no; }
attr() { grep -o "$2=\"[a-z0-9-]*\"" "$1" | head -1 | sed 's/.*="//;s/"//'; }
jget() { grep -o "\"$1\":\"[^\"]*\"" "$2" | head -1 | sed 's/.*:"//;s/"//'; }

echo "== 1. 桌面（web / desktop） =="
code=$(curl -s -A "$UA_DESK" -o /tmp/s1.html -w '%{http_code}' "$BASE/resources")
expect "GET /resources" "$code" "200"
expect "data-runtime" "$(attr /tmp/s1.html data-runtime)" "web"
expect "data-form" "$(attr /tmp/s1.html data-form)" "desktop"
expect "资源为空时显示空态" "$(has '资源库还是空的' /tmp/s1.html)" "yes"

echo "== 2. iPhone（同一端 / mobile 视口） =="
code=$(curl -s -A "$UA_IOS" -o /tmp/s2.html -w '%{http_code}' "$BASE/")
expect "GET / (iPhone)" "$code" "200"
expect "data-form" "$(attr /tmp/s2.html data-form)" "mobile"
expect "底部 tabbar 渲染" "$(grep -c 'class="tabbar"' /tmp/s2.html)" "1"

echo "== 3. 微信内降级 =="
code=$(curl -s -A "$UA_WX" -o /tmp/s3.html -w '%{http_code}' "$BASE/resources")
expect "GET /resources (微信)" "$code" "200"
expect "data-wechat" "$(attr /tmp/s3.html data-wechat)" "true"
expect "微信内 data-wechat=true" "$(attr /tmp/s3.html data-wechat)" "true"
expect "不出现「直接下载」" "$(grep -c '直接下载' /tmp/s3.html)" "0"

echo "== 4. 明暗主题 =="
code=$(curl -s -A "$UA_DESK" -b "theme=light" -o /tmp/s4.html -w '%{http_code}' "$BASE/")
expect "GET / (theme=light)" "$code" "200"
expect "data-theme" "$(attr /tmp/s4.html data-theme)" "light"
expect "轮播已渲染" "$(grep -c 'class="carousel"' /tmp/s4.html)" "1"

echo "== 5. bootstrap 协商 =="
code=$(curl -s -D /tmp/s5.head -A "$UA_IOS" "$BASE/api/v1/bootstrap" -o /tmp/s5.json -w '%{http_code}')
expect "GET /bootstrap" "$code" "200"
expect "runtime" "$(grep -o '"runtime":"[a-z]*"' /tmp/s5.json | head -1 | sed 's/.*:"//;s/"//')" "web"
expect "form" "$(grep -o '"form":"[a-z]*"' /tmp/s5.json | head -1 | sed 's/.*:"//;s/"//')" "mobile"
etag=$(grep -i '^etag:' /tmp/s5.head | tr -d '\r' | sed 's/^[Ee][Tt]ag: //')
code=$(curl -s -o /dev/null -w '%{http_code}' -A "$UA_IOS" -H "If-None-Match: $etag" "$BASE/api/v1/bootstrap")
expect "带 If-None-Match 再请求" "$code" "304"
expect "endpoints 无占位域名" "$(grep -c '\.example' /tmp/s5.json)" "0"

echo "== 6. 匿名边界（必须被拦） =="
code=$(curl -s -X POST -H 'content-type: application/json' -d '{"title":"匿名测试标题","body":"未登录不应能发帖。"}' \
  -o /tmp/s6a.json -w '%{http_code}' "$BASE/api/v1/posts")
expect "未登录发帖" "$code" "403"
expect "错误码" "$(jget error /tmp/s6a.json)" "need_login"

code=$(curl -s -X POST -H 'content-type: application/json' -d '{"id":"community"}' -o /tmp/s6b.json -w '%{http_code}' "$BASE/api/v1/agreements/sign")
expect "未登录签署公约" "$code" "403"

code=$(curl -s -o /tmp/s6c.json -w '%{http_code}' "$BASE/api/v1/admin/agreements")
expect "无凭据访问后台接口" "$code" "401"

curl -s -A "$UA_DESK" "$BASE/admin" -o /tmp/s6d.html
expect "未登录 /admin 显示登录引导" "$(grep -c '后台需要登录' /tmp/s6d.html)" "1"

curl -s -A "$UA_DESK" "$BASE/me" -o /tmp/s6e.html
expect "未登录 /me 显示登录引导" "$(grep -c '还没有登录' /tmp/s6e.html)" "1"

code=$(curl -s -A "$UA_DESK" -o /tmp/cl.html -w '%{http_code}' "$BASE/changelog")
expect "GET /changelog" "$code" "200"
expect "更新日志含最新版本" "$(grep -c '2026.10.21.3' /tmp/cl.html | awk '{print ($1>=1)?"yes":"no"}')" "yes"
expect "更新日志含条目" "$(grep -c 'cl-row' /tmp/cl.html | awk '{print ($1>=1)?"yes":"no"}')" "yes"

echo "== 6.5 404 语义（路由段不能有 loading.tsx，否则状态码会变 200） =="
for u in "/announcements/a-missing" "/p/p-missing" "/resources/r-missing" "/matches/m-missing" "/totally-missing"; do
  expect "404 $u" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$u")" "404"
done
expect "404 页含自定义文案" "$(curl -s "$BASE/announcements/a-missing" | grep -c '404 · 没有这个页面' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

echo "== 7. 注册与首个管理员 =="
initialized=$(curl -s "$BASE/api/v1/auth/state" | grep -o '"initialized":[a-z]*' | sed 's/.*://')
[ -z "$initialized" ] && initialized=unknown

code=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"$U1\",\"nickname\":\"$N1\",\"password\":\"$PW\"}" \
  -D /tmp/s7a.head -o /tmp/s7a.json -w '%{http_code}' "$BASE/api/v1/auth/register")
expect "注册用户 A" "$code" "201"
CK_A=$(grep -i 'set-cookie: ba_session=' /tmp/s7a.head | sed 's/.*ba_session=//;s/;.*//' | tr -d '\r')
expect "下发会话 Cookie" "$([ -n "$CK_A" ] && echo yes || echo no)" "yes"

if [ "$initialized" = "false" ] || [ "$initialized" = "unknown" ]; then
  expect "第一个用户成为管理员" "$(jget role /tmp/s7a.json)" "admin"
  A_IS_ADMIN=1
else
  skipped "第一个用户成为管理员" "数据目录非空（已有账号）"
  A_IS_ADMIN=$([ "$(jget role /tmp/s7a.json)" = "admin" ] && echo 1 || echo 0)
fi

code=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"$U2\",\"nickname\":\"$N2\",\"password\":\"$PW\"}" \
  -D /tmp/s7b.head -o /tmp/s7b.json -w '%{http_code}' "$BASE/api/v1/auth/register")
expect "注册用户 B" "$code" "201"
expect "后注册的一定是成员" "$(jget role /tmp/s7b.json)" "member"
CK_B=$(grep -i 'set-cookie: ba_session=' /tmp/s7b.head | sed 's/.*ba_session=//;s/;.*//' | tr -d '\r')

code=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"$U1\",\"nickname\":\"重复\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' \
  "$BASE/api/v1/auth/register")
expect "用户名重复被拒" "$code" "409"

code=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"weak$STAMP\",\"nickname\":\"弱口令\",\"password\":\"12345678\"}" -o /dev/null -w '%{http_code}' \
  "$BASE/api/v1/auth/register")
expect "弱口令被拒" "$code" "422"

code=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"$U1\",\"password\":\"wrongpass123\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/login")
expect "错误密码登录" "$code" "401"

code=$(curl -s -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"$U1\",\"password\":\"$PW\"}" -D /tmp/s7c.head -o /tmp/s7c.json -w '%{http_code}' "$BASE/api/v1/auth/login")
expect "正确密码登录" "$code" "200"
expect "登录返回当前用户" "$(jget username /tmp/s7c.json)" "$U1"

echo "== 8. 登录后的行为 =="
code=$(curl -s -X POST -b "ba_session=$CK_A" -H 'content-type: application/json' \
  -d '{"title":"未签公约的帖子","body":"签署前不应允许发帖，这条不该被创建。"}' \
  -o /tmp/s8a.json -w '%{http_code}' "$BASE/api/v1/posts")
expect "未签社区公约发帖被拒" "$code" "403"
expect "错误码" "$(jget error /tmp/s8a.json)" "need_agreement"

code=$(curl -s -X POST -b "ba_session=$CK_A" -H 'content-type: application/json' \
  -d '{"id":"community"}' -D /tmp/s8b.head -o /dev/null -w '%{http_code}' "$BASE/api/v1/agreements/sign")
expect "签署社区公约" "$code" "200"
AG_CK=$(grep -i 'set-cookie: ag_community=' /tmp/s8b.head | sed 's/.*ag_community=//;s/;.*//' | tr -d '\r')

PT="冒烟帖子$STAMP"
code=$(curl -s -X POST -b "ba_session=$CK_A" -b "ag_community=$AG_CK" -H 'content-type: application/json' \
  -d "{\"title\":\"$PT\",\"body\":\"这条由冒烟脚本创建，作者应取自账号而非入参。\",\"tags\":[\"测试\"]}" \
  -o /tmp/s8c.json -w '%{http_code}' "$BASE/api/v1/posts")
expect "登录 + 已签公约后发帖" "$code" "201"
expect "作者取自账号" "$(jget author /tmp/s8c.json)" "$N1"
PID=$(grep -o '"id":"[^"]*"' /tmp/s8c.json | head -1 | sed 's/.*:"//;s/"//')

expect "首页出现新帖" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c "$PT")" "1"

code=$(curl -s -X POST -b "ba_session=$CK_A" -b "ag_community=$AG_CK" -H 'content-type: application/json' \
  -d '{"body":"第一条评论，验证写入。"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/posts/$PID/comments")
expect "发表评论" "$code" "201"
expect "详情页出现评论" "$(curl -s -A "$UA_DESK" "$BASE/p/$PID" | grep -c '第一条评论' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

code=$(curl -s -X POST -o /tmp/s8d.json -w '%{http_code}' "$BASE/api/v1/posts/$PID/like")
expect "匿名点赞" "$code" "200"
expect "点赞数 +1" "$(grep -o '"likes":[0-9]*' /tmp/s8d.json | sed 's/.*://')" "1"

ENC=$(printf %s "$PT" | od -An -tx1 | tr -d ' \n' | sed 's/../%&/g')
expect "搜索命中" "$(curl -s -A "$UA_DESK" "$BASE/search?q=$ENC" | grep -c "$PT")" "1"

curl -s -A "$UA_DESK" -b "ba_session=$CK_A" "$BASE/me" -o /tmp/s8e.html
expect "/me 显示当前用户" "$(has "$N1" /tmp/s8e.html)" "yes"
expect "/me 显示我的帖子" "$(has "$PT" /tmp/s8e.html)" "yes"

echo "== 9. 后台按角色鉴权 =="
code=$(curl -s -b "ba_session=$CK_B" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/agreements")
expect "普通成员访问后台接口" "$code" "401"

curl -s -A "$UA_DESK" -b "ba_session=$CK_B" "$BASE/admin" -o /tmp/s9a.html
expect "普通成员看 /admin" "$(grep -c '不是管理员' /tmp/s9a.html)" "1"

ADMIN_ARGS=()
if [ "$A_IS_ADMIN" = "1" ]; then
  ADMIN_ARGS=(-b "ba_session=$CK_A")
  expect "管理员会话可读后台接口" "$(curl -s "${ADMIN_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/agreements")" "200"

  curl -s -A "$UA_DESK" -b "ba_session=$CK_A" "$BASE/admin" -o /tmp/s9b.html
  expect "管理员可进 /admin" "$(has '管理后台' /tmp/s9b.html)" "yes"
elif [ -n "${ADMIN_TOKEN:-}" ]; then
  ADMIN_ARGS=(-H "Authorization: Bearer $ADMIN_TOKEN")
  expect "应急口令可读后台接口" "$(curl -s "${ADMIN_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/agreements")" "200"
else
  skipped "管理员后台断言" "用户 A 不是管理员且未提供 ADMIN_TOKEN"
fi

if [ ${#ADMIN_ARGS[@]} -gt 0 ]; then
  TITLE="验收临时公约$STAMP"
  code=$(curl -s -X POST "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"title\":\"$TITLE\",\"version\":\"v1\",\"scope\":\"冒烟用例\",\"summary\":\"这条是冒烟脚本创建的，会被删掉。\",\"gate\":\"未签署时不能操作\",\"clauses\":[{\"h\":\"示例\",\"p\":\"仅用于验证新增流程。\"}]}" \
    -o /tmp/s9c.json -w '%{http_code}' "$BASE/api/v1/admin/agreements")
  expect "新增公约" "$code" "201"
  NEW_ID=$(grep -o '"id":"[^"]*"' /tmp/s9c.json | head -1 | sed 's/.*:"//;s/"//')

  expect "新公约出现在 /agreements" "$(curl -s -A "$UA_DESK" "$BASE/agreements" | grep -c "$TITLE" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"id\":\"$NEW_ID\",\"active\":false}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/agreements")
  expect "停用公约" "$code" "200"
  expect "停用后 active=false" "$(curl -s "${ADMIN_ARGS[@]}" "$BASE/api/v1/admin/agreements" | python -c "
import sys,json
d=json.load(sys.stdin)
print(next((str(a['active']).lower() for a in d['items'] if a['title']=='$TITLE'), 'missing'))
")" "false"

  code=$(curl -s -X DELETE "${ADMIN_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/agreements?id=$NEW_ID")
  expect "删除公约" "$code" "200"
  expect "内置公约不可删" "$(curl -s -X DELETE "${ADMIN_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/agreements?id=trust")" "403"
fi

echo "== 10. 赞助者 =="
code=$(curl -s -A "$UA_DESK" -o /tmp/s10.html -w '%{http_code}' "$BASE/sponsors")
expect "GET /sponsors" "$code" "200"
expect "含赞助说明" "$(has '赞助者' /tmp/s10.html)" "yes"

code=$(curl -s -X POST -H 'content-type: application/json' -d '{"name":"未授权","amount":1}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/sponsors")
expect "未登录录入赞助" "$code" "401"

if [ ${#ADMIN_ARGS[@]} -gt 0 ]; then
  SPNAME="冒烟赞助者$STAMP"
  code=$(curl -s -X POST "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"name\":\"$SPNAME\",\"amount\":50,\"planTitle\":\"冒烟档\"}" \
    -o /tmp/s10a.json -w '%{http_code}' "$BASE/api/v1/admin/sponsors")
  expect "录入赞助者" "$code" "201"
  SPID=$(grep -o '"id":"[^"]*"' /tmp/s10a.json | head -1 | sed 's/.*:"//;s/"//')

  expect "赞助页出现该赞助者" "$(curl -s -A "$UA_DESK" "$BASE/sponsors" | grep -c "$SPNAME" | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  expect "公开接口含该赞助者" "$(curl -s "$BASE/api/v1/sponsors" | grep -c "$SPNAME")" "1"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"id\":\"$SPID\",\"hidden\":true}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/sponsors")
  expect "隐藏赞助者" "$code" "200"
  expect "隐藏后公开接口不再返回" "$(curl -s "$BASE/api/v1/sponsors" | grep -c "$SPNAME")" "0"

  code=$(curl -s -X DELETE "${ADMIN_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/sponsors?id=$SPID")
  expect "删除手动赞助者" "$code" "200"

  code=$(curl -s -X POST "${ADMIN_ARGS[@]}" -o /tmp/s10b.json -w '%{http_code}' "$BASE/api/v1/admin/afdian/sync")
  if [ "$code" = "400" ]; then
    expect "未配置爱发电时同步被拒" "$(jget error /tmp/s10b.json)" "afdian_not_configured"
  else
    skipped "未配置爱发电时同步被拒" "当前环境已配置 AFDIAN_*，返回 $code"
  fi
else
  skipped "赞助者写入链路" "没有管理员凭据"
fi

echo "== 11. 站内信 =="
code=$(curl -s -o /tmp/s11a.json -w '%{http_code}' "$BASE/api/v1/notifications")
expect "匿名读站内信" "$code" "200"
expect "匿名 loggedIn=false" "$(grep -o '\"loggedIn\":[a-z]*' /tmp/s11a.json | sed 's/.*://')" "false"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/notifications/read")
expect "未登录标记已读" "$code" "403"

if [ -n "$CK_A" ]; then
  curl -s -b "ba_session=$CK_A" "$BASE/api/v1/notifications" -o /tmp/s11b.json
  expect "登录后可读站内信" "$(grep -o '\"loggedIn\":[a-z]*' /tmp/s11b.json | sed 's/.*://')" "true"
  code=$(curl -s -b "ba_session=$CK_A" -X POST -H 'content-type: application/json' -d '{}' -o /tmp/s11c.json -w '%{http_code}' "$BASE/api/v1/notifications/read")
  expect "标记全部已读" "$code" "200"
  expect "返回 readAt" "$(grep -c '"readAt"' /tmp/s11c.json)" "1"
  # 注意：列表项里也有 unread 布尔，grep 会先命中它；必须按 JSON 取顶层字段
  expect "已读后未读归零" "$(curl -s -b "ba_session=$CK_A" "$BASE/api/v1/notifications" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).unread))")" "0"
fi

if [ "$A_IS_ADMIN" = "1" ]; then
  echo "== 12. 后台用户与帖子 =="
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
  expect "未登录读用户列表" "$code" "401"

  USERS_TMP="$PWD/.smoke-users.json"
  code=$(curl -s -b "ba_session=$CK_A" -o "$USERS_TMP" -w '%{http_code}' "$BASE/api/v1/admin/users")
  expect "管理员读用户列表" "$code" "200"
  UN=$(grep -o '"id":"u' "$USERS_TMP" | wc -l | tr -d ' ')
  expect "列表至少含两名用户" "$([ "$UN" -ge 2 ] && echo yes || echo no)" "yes"

  A_ID=$(python -c "import json;d=json.load(open('.smoke-users.json',encoding='utf-8'));print(next(u['id'] for u in d['items'] if u['username']=='$U1'))")
  B_ID=$(python -c "import json;d=json.load(open('.smoke-users.json',encoding='utf-8'));print(next(u['id'] for u in d['items'] if u['username']=='$U2'))")
  code=$(curl -s -b "ba_session=$CK_A" -X PATCH -H 'content-type: application/json' \
    -d "{\"id\":\"$A_ID\",\"role\":\"member\"}" -o /tmp/s12b.json -w '%{http_code}' "$BASE/api/v1/admin/users")
  expect "改自己角色被拒" "$code" "403"

  code=$(curl -s -b "ba_session=$CK_A" -X PATCH -H 'content-type: application/json' \
    -d "{\"id\":\"$B_ID\",\"banned\":true}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
  expect "封禁普通成员" "$code" "200"

  code=$(curl -s -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$U2\",\"password\":\"$PW\"}" -o /tmp/s12c.json -w '%{http_code}' "$BASE/api/v1/auth/login")
  expect "被封禁账号登录被拒" "$code" "403"
  expect "错误码" "$(jget error /tmp/s12c.json)" "account_banned"

  expect "被封禁账号会话失效" "$(curl -s -b "ba_session=$CK_B" "$BASE/me" | grep -c '还没有登录')" "1"

  code=$(curl -s -b "ba_session=$CK_A" -X PATCH -H 'content-type: application/json' \
    -d "{\"id\":\"$B_ID\",\"banned\":false}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
  expect "解封" "$code" "200"

  code=$(curl -s -b "ba_session=$CK_A" -o /tmp/s12d.json -w '%{http_code}' "$BASE/api/v1/admin/posts")
  expect "管理员读帖子列表" "$code" "200"
  expect "列表含冒烟帖" "$(grep -c "$PT" /tmp/s12d.json)" "1"

  code=$(curl -s -b "ba_session=$CK_A" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/posts?id=$PID")
  expect "删除帖子" "$code" "200"
  expect "首页不再出现" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c "$PT")" "0"
  expect "重复删除返回 404" "$(curl -s -b "ba_session=$CK_A" -X DELETE -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/posts?id=$PID")" "404"

  echo "== 12.5 头衔 =="
  code=$(curl -s -X PATCH -H 'content-type: application/json' -d '{"title":"路人甲"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/me")
  expect "未登录改头衔" "$code" "401"

  code=$(curl -s -b "ba_session=$CK_B" -X PATCH -H 'content-type: application/json' \
    -d '{"title":"官方"}' -o /tmp/s125a.json -w '%{http_code}' "$BASE/api/v1/me")
  expect "成员用保留头衔被拒" "$code" "422"
  expect "保留字错误码" "$(jget error /tmp/s125a.json)" "invalid_title"

  code=$(curl -s -b "ba_session=$CK_B" -X PATCH -H 'content-type: application/json' \
    -d '{"title":"搬砖工"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/me")
  expect "成员自定义头衔" "$code" "200"
  expect "/me 显示自定义头衔" "$(curl -s -b "ba_session=$CK_B" "$BASE/me" | grep -c '搬砖工' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -b "ba_session=$CK_A" -X PATCH -H 'content-type: application/json' \
    -d '{"title":"服主"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/me")
  expect "管理员自定义头衔" "$code" "200"
  expect "管理员徽标为暖色样式" "$(curl -s -b "ba_session=$CK_A" "$BASE/me" | grep -c 'data-kind="admin"' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -b "ba_session=$CK_A" -X PATCH -H 'content-type: application/json' \
    -d "{\"id\":\"$B_ID\",\"title\":\"记录员\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/users")
  expect "后台改他人头衔" "$code" "200"
fi

if [ "$A_IS_ADMIN" = "1" ]; then
  echo "== 13. 公告 / 轮播 / 站点设置 =="
  code=$(curl -s -X POST -H 'content-type: application/json' -d '{"title":"未授权","body":"x"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/announcements")
  expect "未登录发布公告" "$code" "401"

  AN_TITLE="冒烟公告$STAMP"
  code=$(curl -s -X POST "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"title\":\"$AN_TITLE\",\"body\":\"这条用于验证公告链路。\",\"kind\":\"系统\",\"pinned\":true}" \
    -o /tmp/s13a.json -w '%{http_code}' "$BASE/api/v1/admin/announcements")
  expect "发布公告" "$code" "201"
  AN_ID=$(grep -o '"id":"a[^"]*"' /tmp/s13a.json | head -1 | sed 's/.*:"//;s/"//')

  expect "公告列表出现" "$(curl -s -A "$UA_DESK" "$BASE/announcements" | grep -c "$AN_TITLE" | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  expect "公告详情可访问" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/announcements/$AN_ID")" "200"
  expect "首页右栏出现公告" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c "$AN_TITLE" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"id\":\"$AN_ID\",\"published\":false}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/announcements")
  expect "转草稿" "$code" "200"
  expect "草稿 published=false" "$(curl -s "${ADMIN_ARGS[@]}" "$BASE/api/v1/admin/announcements" | python -c "
import sys,json
d=json.load(sys.stdin)
print(next((str(a['published']).lower() for a in d['items'] if a['title']=='$AN_TITLE'), 'missing'))
")" "false"
  expect "草稿则 404（状态码）" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/announcements/$AN_ID")" "404"
  expect "删除公告" "$(curl -s -X DELETE "${ADMIN_ARGS[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/announcements?id=$AN_ID")" "200"

  SL_ID=$(curl -s "${ADMIN_ARGS[@]}" "$BASE/api/v1/admin/slides" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"id\":\"$SL_ID\",\"bgColor\":\"#123456\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/slides")
  expect "改轮播背景色" "$code" "200"
  expect "首页出现该背景色" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c '#123456' | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"id\":\"$SL_ID\",\"bgColor\":\"#1b1b1e\"}" -o /dev/null

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"siteName":"冒烟站点名"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "后台改站点名" "$code" "200"
  expect "顶栏显示新站名" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c '冒烟站点名' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  echo "== 13.1 站点标识 =="
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"logoText":"AB"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "改标识文字" "$code" "200"
  expect "顶栏用自定义标识" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c '>AB</span>' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"logoText":"ABC"}' -o /tmp/s131a.json -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "标识超过两个字被拒" "$code" "422"
  expect "标识错误码" "$(jget error /tmp/s131a.json)" "invalid_logo"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"logoImage":"javascript:alert(1)"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "非法图片地址被拒" "$code" "422"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"logoImage":"/logo-smoke.png"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "图片标识保存" "$code" "200"
  expect "顶栏渲染图片标识" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c 'data-kind="image"' | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  expect "图片地址已生效" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c 'logo-smoke.png' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"logoImage"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除图片标识" "$code" "200"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"logoText"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除文字标识" "$code" "200"
  sleep 0.4
  expect "标识已恢复默认" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c 'logo-smoke.png')" "0"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"allowRegister":false}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "关闭注册" "$code" "200"
  sleep 0.4
  code=$(curl -s -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"closed$STAMP\",\"nickname\":\"关闭注册\",\"password\":\"Closed2026pw\"}" -o /tmp/s13d.json -w '%{http_code}' "$BASE/api/v1/auth/register")
  expect "关闭注册后拒绝" "$code" "403"
  expect "错误码" "$(jget error /tmp/s13d.json)" "register_closed"
  expect "注册页提示暂停" "$(curl -s -A "$UA_DESK" "$BASE/register" | grep -c '暂停注册' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  # 收尾：把测试改动清干净，避免污染真实数据目录
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"allowRegister":true}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "恢复开放注册" "$code" "200"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"siteName"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除测试站名" "$code" "200"
  sleep 0.4
  expect "站名已复原" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c '冒烟站点名')" "0"
fi

if [ "$A_IS_ADMIN" = "1" ]; then
  echo "== 14. 邮箱 / 徽章 / 页脚 / 第三方登录 =="
  EM="smoke$STAMP@example.com"
  EMU="smokemail$STAMP"
  code=$(curl -s -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$EMU\",\"nickname\":\"邮箱用户\",\"email\":\"$EM\",\"password\":\"$PW\"}" \
    -o /tmp/s14a.json -w '%{http_code}' "$BASE/api/v1/auth/register")
  expect "用邮箱注册" "$code" "201"

  code=$(curl -s -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"other$STAMP\",\"nickname\":\"重名邮箱\",\"email\":\"$EM\",\"password\":\"$PW\"}" \
    -o /tmp/s14b.json -w '%{http_code}' "$BASE/api/v1/auth/register")
  expect "邮箱重复被拒" "$code" "409"
  expect "邮箱重复错误码" "$(jget error /tmp/s14b.json)" "email_taken"

  code=$(curl -s -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$EM\",\"password\":\"$PW\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/login")
  expect "用邮箱登录" "$code" "200"

  expect "我的页展示徽章" "$(curl -s -b "ba_session=$CK_A" "$BASE/me" | grep -c 'bz-item' | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  expect "徽章含创始成员" "$(curl -s -b "ba_session=$CK_A" "$BASE/me" | grep -c '创始成员' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  FT="冒烟页脚$STAMP"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"footerText\":\"$FT\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "设置页脚文案" "$code" "200"
  expect "页脚已显示" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c "$FT" | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"footerText"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除页脚文案" "$code" "200"
  sleep 0.4
  expect "页脚已复原" "$(curl -s -A "$UA_DESK" "$BASE/" | grep -c "$FT")" "0"

  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/oauth/github")
  expect "未配置时 GitHub 登录重定向" "$code" "307"
  expect "重定向带 provider_disabled" \
    "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/api/v1/auth/oauth/github" | grep -c 'error=provider_disabled')" "1"
  expect "未知 provider 被拒" \
    "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/api/v1/auth/oauth/weibo" | grep -c 'error=unknown_provider')" "1"

  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/oauth/github/callback?code=x&state=y")
  expect "未配置时回调被拒" "$code" "307"
  expect "回调错误码 provider_disabled" \
    "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/api/v1/auth/oauth/github/callback?code=x&state=y" | grep -c 'error=provider_disabled')" "1"

  GT="登录后可见·冒烟$STAMP"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"meGuestText\":\"$GT\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "设置我的页未登录提示" "$code" "200"
  expect "提示已生效" "$(curl -s -A "$UA_DESK" "$BASE/me" | grep -c "$GT" | awk '{print ($1>=1)?"yes":"no"}')" "yes"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"meGuestText"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除我的页提示" "$code" "200"
  sleep 0.4
  expect "回落到默认文案" "$(curl -s -A "$UA_DESK" "$BASE/me" | grep -c '第一个注册的用户会成为管理员' | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  LH="登录提示·冒烟$STAMP"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"loginHint\":\"$LH\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "设置登录页提示" "$code" "200"
  expect "登录页提示已生效" "$(curl -s -A "$UA_DESK" "$BASE/login" | grep -c "$LH" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  RH="注册提示·冒烟$STAMP"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d "{\"registerHint\":\"$RH\"}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "设置注册页提示" "$code" "200"
  expect "注册页提示已生效" "$(curl -s -A "$UA_DESK" "$BASE/register" | grep -c "$RH" | awk '{print ($1>=1)?"yes":"no"}')" "yes"

  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"loginHint"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除登录页提示" "$code" "200"
  code=$(curl -s -X PATCH "${ADMIN_ARGS[@]}" -H 'content-type: application/json' \
    -d '{"resetKey":"registerHint"}' -o /dev/null -w '%{http_code}' "$BASE/api/v1/admin/settings")
  expect "清除注册页提示" "$code" "200"
  sleep 0.6
  expect "登录提示已复原" "$(curl -s -A "$UA_DESK" "$BASE/login" | grep -c '登录后可发帖' | awk '{print ($1>=1)?"yes":"no"}')" "yes"
fi

echo "== 15. 退出登录 =="
code=$(curl -s -X POST -b "ba_session=$CK_A" -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/logout")
expect "POST /auth/logout" "$code" "200"

rm -f .smoke-users.json

echo
echo "结果：$pass 通过 / $fail 失败 / $skip 跳过"
[ "$fail" -eq 0 ] || exit 1
