#!/usr/bin/env bash
# 内容链路冒烟：公约门槛 → 发帖 → 点赞 → 评论 → 站内信
#
#   bash scripts/smoke-content.sh http://127.0.0.1:8080
#
# 会写测试数据（账号 / 帖子 / 评论），**只对测试库跑**。

set -u

BASE="${1:-http://127.0.0.1:8080}"
CURL=(curl -s --max-time 10)
mkdir -p .smoke
TMP="$(mktemp -d .smoke/content-XXXXXX)"
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

jsonlen() { python -c "import json,sys;print(len(json.load(open(sys.argv[1],encoding='utf-8')).get('items',[])))" "$1"; }

STAMP=$(date +%s)
A="owner$STAMP"
B="guest$STAMP"
PW="smoke1234"

echo "== 1. 两个账号 =="
"${CURL[@]}" -c "$TMP/a.jar" -o "$TMP/a.json" -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d "{\"username\":\"$A\",\"nickname\":\"楼主$STAMP\",\"password\":\"$PW\"}"
expect "楼主注册" "$(jget "$TMP/a.json" ok)" "True"
"${CURL[@]}" -c "$TMP/b.jar" -o "$TMP/b.json" -X POST "$BASE/api/v1/auth/register" \
  -H 'content-type: application/json' -d "{\"username\":\"$B\",\"nickname\":\"路人$STAMP\",\"password\":\"$PW\"}"
expect "路人注册" "$(jget "$TMP/b.json" ok)" "True"

echo "== 2. 公约 =="
c=$("${CURL[@]}" -o "$TMP/ag.json" -w '%{http_code}' "$BASE/api/v1/agreements")
expect "公约列表 200" "$c" "200"
expect "内置两份" "$(jsonlen "$TMP/ag.json")" "2"

c=$("${CURL[@]}" -b "$TMP/a.jar" -c "$TMP/a.jar" -o "$TMP/sign.json" -w '%{http_code}' -X POST "$BASE/api/v1/agreements/sign" \
  -H 'content-type: application/json' -d '{"id":"community"}')
expect "签社区公约 200" "$c" "200"
expect "返回版本" "$(jget "$TMP/sign.json" version)" "v1.2"
expect "写入 ag_community Cookie" "$(grep -c 'ag_community' "$TMP/a.jar")" "1"

echo "== 3. 发帖门槛 =="
c=$("${CURL[@]}" -b "$TMP/b.jar" -o "$TMP/deny.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts" \
  -H 'content-type: application/json' -d '{"title":"未签公约发帖","body":"这段正文长度足够但应该被拦住"}')
expect "未签公约发帖 403" "$c" "403"
expect "错误码 need_agreement" "$(jget "$TMP/deny.json" error)" "need_agreement"

c=$("${CURL[@]}" -o "$TMP/anon.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts" \
  -H 'content-type: application/json' -d '{"title":"匿名发帖测试","body":"这段正文长度足够但应该被拦住"}')
expect "匿名发帖 403" "$c" "403"
expect "错误码 need_login" "$(jget "$TMP/anon.json" error)" "need_login"

echo "== 4. 发帖 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/post.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts" \
  -H 'content-type: application/json' \
  -d "{\"title\":\"冒烟帖 $STAMP\",\"body\":\"这是一条用于验证发帖链路的正文，长度足够。\",\"tags\":[\"测试\",\"冒烟\"]}")
expect "发帖 201" "$c" "201"
PID=$(grep -o '"id":"p[^"]*"' "$TMP/post.json" | head -1 | sed 's/.*:"//;s/"//')
expect "返回帖子 id" "$(printf '%s' "$PID" | cut -c1)" "p"
expect "作者取自会话" "$(jget "$TMP/post.json" post.author)" "楼主$STAMP"
expect "likes 初始 0" "$(jget "$TMP/post.json" post.likes)" "0"

c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/short.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts" \
  -H 'content-type: application/json' -d '{"title":"短","body":"太短"}')
expect "标题过短 422" "$c" "422"
expect "错误码 invalid_input" "$(jget "$TMP/short.json" error)" "invalid_input"

echo "== 5. 列表与点赞 =="
c=$("${CURL[@]}" -o "$TMP/list.json" -w '%{http_code}' "$BASE/api/v1/posts")
expect "列表 200" "$c" "200"
expect "列表里有这篇" "$(jget "$TMP/list.json" items.0.title)" "冒烟帖 $STAMP"

c=$("${CURL[@]}" -o "$TMP/like1.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts/$PID/like")
expect "点赞 200" "$c" "200"
expect "计数 1" "$(jget "$TMP/like1.json" likes)" "1"
"${CURL[@]}" -o "$TMP/like2.json" -X POST "$BASE/api/v1/posts/$PID/like"
expect "再点一次计数 2（计数器语义）" "$(jget "$TMP/like2.json" likes)" "2"

c=$("${CURL[@]}" -o "$TMP/like404.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts/pnotexist/like")
expect "不存在的帖子点赞 404" "$c" "404"

echo "== 6. 评论 =="
c=$("${CURL[@]}" -b "$TMP/b.jar" -o "$TMP/cdeny.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts/$PID/comments" \
  -H 'content-type: application/json' -d '{"body":"未签公约的评论"}')
expect "未签公约评论 403" "$c" "403"

"${CURL[@]}" -o /dev/null -X POST "$BASE/api/v1/agreements/sign" -b "$TMP/b.jar" \
  -H 'content-type: application/json' -d '{"id":"community"}'

c=$("${CURL[@]}" -b "$TMP/b.jar" -o "$TMP/c1.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts/$PID/comments" \
  -H 'content-type: application/json' -d '{"body":"路过看看，写得不错"}')
expect "评论 201" "$c" "201"
expect "评论作者取自会话" "$(jget "$TMP/c1.json" comment.author)" "路人$STAMP"

c=$("${CURL[@]}" -b "$TMP/b.jar" -o "$TMP/c2.json" -w '%{http_code}' -X POST "$BASE/api/v1/posts/$PID/comments" \
  -H 'content-type: application/json' -d '{"body":"短"}')
expect "评论过短 422" "$c" "422"

c=$("${CURL[@]}" -o "$TMP/list2.json" -w '%{http_code}' "$BASE/api/v1/posts")
expect "列表评论数 1" "$(jget "$TMP/list2.json" items.0.comments)" "1"
expect "带出评论正文" "$(jget "$TMP/list2.json" items.0.commentsList.0.body)" "路过看看，写得不错"

echo "== 7. 站内信 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/n1.json" -w '%{http_code}' "$BASE/api/v1/notifications")
expect "站内信 200" "$c" "200"
# 注意：站内信是「全站别人发的评论」（与 Node 版语义一致），不是只看自己帖子下的，
# 所以这里只能断言「至少 1 条」，不能断言恰好 1 条。
expect "有未读" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print('yes' if d['unread'] >= 1 else 'no')
" "$TMP/n1.json")" "yes"
expect "通知文案含帖子标题" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print('yes' if any('冒烟帖' in i['text'] for i in d['items']) else 'no')
" "$TMP/n1.json")" "yes"

c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/n2.json" -w '%{http_code}' -X POST "$BASE/api/v1/notifications/read" \
  -H 'content-type: application/json' -d '{}')
expect "标记已读 200" "$c" "200"
"${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/n3.json" "$BASE/api/v1/notifications"
expect "已读后未读归零" "$(jget "$TMP/n3.json" unread)" "0"

echo "== 8. 签署状态 =="
c=$("${CURL[@]}" -b "$TMP/a.jar" -o "$TMP/sig.json" -w '%{http_code}' "$BASE/api/v1/agreements/signatures")
expect "签署状态 200" "$c" "200"
expect "含 community" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print('yes' if any(i['id']=='community' for i in d['items']) else 'no')
" "$TMP/sig.json")" "yes"

echo "== 9. 搜索与徽章 =="
AID=$(jget "$TMP/a.json" user.id)
c=$("${CURL[@]}" -G --data-urlencode "q=冒烟帖 $STAMP" -o "$TMP/s1.json" -w '%{http_code}' "$BASE/api/v1/posts")
expect "搜索 200" "$c" "200"
expect "命中 1 条" "$(jget "$TMP/s1.json" total)" "1"

c=$("${CURL[@]}" -G --data-urlencode "q=zzz没有这个词zzz" -o "$TMP/s2.json" -w '%{http_code}' "$BASE/api/v1/posts")
expect "无结果 200" "$c" "200"
expect "结果为 0" "$(jget "$TMP/s2.json" total)" "0"

# 通配符必须被转义：否则 % 会命中全部帖子
c=$("${CURL[@]}" -G --data-urlencode "q=%" -o "$TMP/s3.json" -w '%{http_code}' "$BASE/api/v1/posts")
expect "百分号不当通配符" "$(jget "$TMP/s3.json" total)" "0"

c=$("${CURL[@]}" -o "$TMP/ach.json" -w '%{http_code}' "$BASE/api/v1/achievements")
expect "徽章表 200" "$c" "200"
expect "作者已获初次发声" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
ids=[b['id'] for b in d['map'].get('id:'+sys.argv[2],[])]
print('yes' if 'first-post' in ids else 'no')
" "$TMP/ach.json" "$AID")" "yes"
expect "全站有人拿到创始成员" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print('yes' if any('founder' in [b['id'] for b in v] for v in d['map'].values()) else 'no')
" "$TMP/ach.json")" "yes"

c=$("${CURL[@]}" -o "$TMP/one.json" -w '%{http_code}' "$BASE/api/v1/achievements/$AID")
expect "单人徽章 200" "$c" "200"
expect "目录共 8 项" "$(python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
print(len(d['all']))
" "$TMP/one.json")" "8"
c=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/v1/achievements/unotexist")
expect "不存在的用户 404" "$c" "404"

echo
echo "通过 $pass 项，失败 $fail 项"
[ "$fail" -eq 0 ]
