# 端能力契约 · 单一 Web 端

> 2026-10-20 变更：**Web 与 H5 合并为一个端**，`runtime` 不再有 `h5`。
> 移动端不是"另一种端"，是同一个 web 端的窄视口；真正会改变能力的只有微信内置浏览器。
>
> 接口定义：`bootstrap.openapi.yaml` · 实现：`../web/src/lib/capabilities.ts`（唯一实现，不再维护第二份）

---

## 1. 四个概念，别混

| 概念 | 取值 | 何时确定 | 作用 |
|---|---|---|---|
| `platform` | web / android / ios | 编译期（构建产物） | 分发渠道、商店审核、升级策略 |
| `runtime` | web / android / ios | 每请求一次（服务端 UA） | 契约里的"端"标识，只有三种 |
| `form` | desktop / mobile | 每请求一次 | **只影响布局**，不影响能力；由 CSS 断点接管 |
| `isWeChat` | true / false | 每请求一次 | 唯一的能力修正因子：宿主约束 |

**不变量**

1. `platform !== 'web'` ⇒ `runtime === platform` 且 `form === 'mobile'`。
2. `form` 变化不改变任何 capability —— 移动端不是降级形态。
3. `isWeChat` 只能收紧能力，不能放宽。
4. `capabilities` fail-closed：服务端只能关，客户端不能自己开。

---

## 2. 判定优先级

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | `native` | 原生包，platform 即 runtime |
| 2 | `forced` | dev 专用 `__form` cookie，用于桌面验证移动布局 |
| 3 | `wechat` | UA 含 `MicroMessenger` / `wxwork` → form=mobile, isWeChat=true |
| 4 | `ua-ch` | `sec-ch-ua-mobile: ?1` |
| 5 | `ua-regex` | Android / iPhone / iPad / Mobile / HarmonyOS |
| 6 | `default` | 其余按 desktop |

`x-runtime` / `x-form` / `x-runtime-source` / `x-wechat` 四个响应头会透出判定结果，便于 CDN 分桶与观测。

---

## 3. 合并顺序（三层）

```
DEFAULTS[runtime]  ──►  微信覆盖（改值）  ──►  服务端下发（取 AND）
     基线能力              宿主事实             运营开关
```

- **微信覆盖**直接改值：它要打开 `wechatWebAuth` / `wechatJsSdk`，用 AND 永远打不开。
- **服务端下发**用 AND：只能关，用于紧急降级、审核期关闭、灰度回滚。
- **配额**（`limits`）取 `min`；微信内 `maxUploadBytes` 收紧到 300MB、`evidenceVideoBytes` 归 0。

---

## 4. 能力矩阵（32 键 × 4 种组合）

| 键 | web 桌面/移动 | web·微信 | android | ios |
|---|---|---|---|---|
| `auth.wechatWebAuth` | — | ✅ | — | — |
| `auth.wechatQr` | ✅ | — | ✅ | ✅ |
| `auth.apple` | ✅ | — | — | ✅ |
| `media.resumable` | ✅ | — | ✅ | ✅ |
| `media.videoExternalOnly` | — | ✅ | — | — |
| `resource.directDownload` | ✅ | — | ✅ | ✅ |
| `resource.externalBrowserHint` | — | ✅ | — | — |
| `share.wechatJsSdk` | — | ✅ | — | — |
| `share.wechatLaunchApp` | — | ✅ | — | — |
| `share.nativeShareSheet` | ✅ | — | ✅ | ✅ |
| `match.evidenceVideoUpload` | ✅ | — | ✅ | ✅ |
| `realtime.backgroundPush` | — | — | ✅ | ✅ |
| `admin.console` | ✅ | ✅ | — | — |

其余键（账号密码、验证码、发帖、评论、私信、搜索、预签名上传、证据截图、积分、隐私等）在四列中均为 ✅，完整表见端能力台 `/dev/capabilities`。

**关键变化**：以前"移动端不能直下文件"是错的——不能直下的是**微信内置浏览器**，普通手机浏览器可以。合并后这条规则终于落在正确的位置上。

---

## 5. 接口摘要

`GET /api/v1/bootstrap` 返回：

```json
{
  "client": { "runtime": "web", "form": "mobile", "isWeChat": false, "runtimeSource": "ua-regex" },
  "capabilities": { "...": "32 个布尔" },
  "limits": { "maxUploadBytes": 2147483648, "evidenceVideoBytes": 536870912 },
  "features": {}, "upgrade": { "policy": "none" }, "review": { "mode": "normal" },
  "ttl": 300
}
```

- `200` 正常 / `304` 未变更（ETag 只对稳定配置求哈希，**不含 serverTime**）
- `426` 版本门槛，仅 App 会收到
- `429 / 503` 回落本地默认表，禁止白屏

---

## 6. 五条落地约束

1. **单一判定出口**：只有 `capabilities.ts` 解析 UA；业务代码禁止 `navigator.userAgent`。
2. **布局不读能力**：移动布局用 CSS 断点，不要写 `if (form === 'mobile')` 去改 DOM 结构。
3. **能力不是鉴权**：上传大小、后台权限、仲裁操作服务端独立校验。
4. **新增键的顺序**：默认表加键（false）→ 发客户端 → 再下发。
5. **观测**：`runtime_mismatch` 与 `x-form` 一起上报，否则查不出"为什么这台设备走了桌面布局"。
