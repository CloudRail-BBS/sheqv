'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '@/lib/settings';
import type { SettingsSection } from '@/lib/settings-sections';
import { BrandMark } from './brand-mark';
import { NavSettings } from './nav-settings';

type Key = keyof SiteSettings;

const HINT_FIELDS: { key: Key; label: string; placeholder: string }[] = [
  { key: 'guildsHint', label: '公会页', placeholder: '公会是自己独立的社区单元：负责人、招募状态、战绩与榜单都只算公会自己。' },
  { key: 'teamsHint', label: '战队页', placeholder: '战队独立于公会：不隶属于任何公会，有自己的负责人、自己的战绩、单独一张榜。' },
  { key: 'matchesHint', label: '约战页', placeholder: '发起申请 → 对方接受并锁定名单 → 比赛与结果确认' },
  { key: 'serversHint', label: '联机大厅', placeholder: 'Minecraft 服务器与 Rusted Warfare 联机房 · 人数与在线状态自动刷新' },
  { key: 'resourcesHint', label: '资源库', placeholder: '地图、整合包、材质与工具 · 开发者与团队的作品都在这里' },
  { key: 'devTeamsHint', label: '开发团队页', placeholder: '面向资源作者的团队：成员共同维护作品，团队单独上开发者榜。' },
  { key: 'leaderboardHint', label: '排行榜', placeholder: '只统计双方确认或仲裁裁定的比赛 · 公会榜与战队榜分开计算' },
  { key: 'pointsHint', label: '积分页', placeholder: '签到与社区行为都会累计积分，明细只增不减地记在下面' },
  { key: 'rewardsHint', label: '福利中心', placeholder: '礼品卡、兑换码与抽奖 · 登录后可以拆卡、兑换与参与抽奖' },
  { key: 'announcementsHint', label: '公告页', placeholder: '赛季规则、版本更新与仲裁结果都在这里，由管理员在后台发布。' },
  { key: 'policiesHint', label: '政策页', placeholder: '使用本站服务前请阅读。政策由站点管理员维护，更新后立即生效。' },
];

interface Props {
  settings: SiteSettings;
  overrides: Partial<Record<Key, string | boolean>>;
  /** 只读展示：这些必须留在环境变量里 */
  runtime: { effectiveBaseUrl: string; dataDir: string; port: string };
  section?: SettingsSection;
}

export function SettingsForm({ settings, overrides, runtime, section = 'site' }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState<Key | 'all' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageMsg, setStorageMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function applyStoragePreset(preset: 'aliyun' | 'rainyun') {
    if (preset === 'aliyun') {
      setForm((f) => ({
        ...f,
        storageDriver: 's3',
        storageEndpoint: 'https://s3.oss-cn-hangzhou.aliyuncs.com',
        storageRegion: 'cn-hangzhou',
        storageForcePathStyle: false,
      }));
    } else {
      setForm((f) => ({
        ...f,
        storageDriver: 's3',
        storageEndpoint: 'https://cn-sy1.rains3.com',
        storageRegion: 'rainyun',
        storageForcePathStyle: true,
      }));
    }
    setStorageMsg(null);
  }

  async function testStorage() {
    setStorageBusy(true);
    setStorageMsg(null);
    const res = await fetch('/api/v1/admin/storage/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        storageDriver: form.storageDriver,
        storageEndpoint: form.storageEndpoint,
        storageRegion: form.storageRegion,
        storageBucket: form.storageBucket,
        storageAccessKey: form.storageAccessKey,
        storageSecretKey: form.storageSecretKey,
        storagePathPrefix: form.storagePathPrefix,
        storageForcePathStyle: form.storageForcePathStyle,
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { message?: string } | null;
    setStorageBusy(false);
    if (!res?.ok) {
      setStorageMsg({ kind: 'err', text: data?.message ?? '连接失败' });
      return;
    }
    setStorageMsg({ kind: 'ok', text: data?.message ?? '连接成功' });
  }

  const isOverride = (k: Key) => Object.prototype.hasOwnProperty.call(overrides, k);

  async function save() {
    setBusy('all');
    setMsg(null);
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteName: form.siteName,
        logoText: form.logoText,
        logoImage: form.logoImage,
        seoTitle: form.seoTitle,
        seoDescription: form.seoDescription,
        seoKeywords: form.seoKeywords,
        seoOgImage: form.seoOgImage,
        seoIndex: form.seoIndex,
        seoVerification: form.seoVerification,
        seoTwitter: form.seoTwitter,
        storageDriver: form.storageDriver,
        storageEndpoint: form.storageEndpoint,
        storageRegion: form.storageRegion,
        storageBucket: form.storageBucket,
        storageAccessKey: form.storageAccessKey,
        storageSecretKey: form.storageSecretKey,
        storagePathPrefix: form.storagePathPrefix,
        storageForcePathStyle: form.storageForcePathStyle,
        githubClientId: form.githubClientId,
        githubClientSecret: form.githubClientSecret,
        cnkdClientId: form.cnkdClientId,
        cnkdClientSecret: form.cnkdClientSecret,
        footerText: form.footerText,
        footerIcp: form.footerIcp,
        footerLinks: form.footerLinks,
        meGuestText: form.meGuestText,
        loginHint: form.loginHint,
        registerHint: form.registerHint,
        loginPoints: form.loginPoints,
        guildsHint: form.guildsHint,
        teamsHint: form.teamsHint,
        matchesHint: form.matchesHint,
        serversHint: form.serversHint,
        resourcesHint: form.resourcesHint,
        devTeamsHint: form.devTeamsHint,
        leaderboardHint: form.leaderboardHint,
        pointsHint: form.pointsHint,
        rewardsHint: form.rewardsHint,
        announcementsHint: form.announcementsHint,
        policiesHint: form.policiesHint,
        publicBaseUrl: form.publicBaseUrl,
        geetestId: form.geetestId,
        geetestKey: form.geetestKey,
        afdianUserId: form.afdianUserId,
        afdianToken: form.afdianToken,
        afdianPageUrl: form.afdianPageUrl,
        allowRegister: form.allowRegister,
        homeShowAnnouncements: form.homeShowAnnouncements,
        emailLoginEnabled: form.emailLoginEnabled,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass,
        smtpFrom: form.smtpFrom,
        smtpSecure: form.smtpSecure,
        postAuditMode: form.postAuditMode,
        aiBaseUrl: form.aiBaseUrl,
        aiApiKey: form.aiApiKey,
        aiModel: form.aiModel,
        aiPrompt: form.aiPrompt,
        sidebarItems: form.sidebarItems,
        tabbarItems: form.tabbarItems,
      }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '保存失败' });
      return;
    }
    setMsg({ kind: 'ok', text: '已保存，立即生效' });
    router.refresh();
  }

  async function resetKey(k: Key) {
    setBusy(k);
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resetKey: k }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '恢复失败' });
      return;
    }
    router.refresh();
  }

  return (
    <div className="settings-sections" data-active-section={section}>
      <div className="card card-pad" data-section="site" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13 }}>站点</h3>
        <label className="field" style={{ marginTop: 10, maxWidth: 360 }}>
          <span>
            站点名
            {isOverride('siteName') && <em className="ovr">已被后台覆盖</em>}
          </span>
          <input
            className="input"
            value={form.siteName}
            onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            maxLength={24}
          />
        </label>
        {isOverride('siteName') && (
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={() => resetKey('siteName')}>
            恢复默认
          </button>
        )}

        <div className="logo-edit">
          <div className="logo-fields">
            <label className="field" style={{ width: 150 }}>
              <span>站点标识文字</span>
              <input
                className="input"
                value={form.logoText}
                onChange={(e) => setForm({ ...form, logoText: Array.from(e.target.value).slice(0, 2).join('') })}
                placeholder="1–2 字"
                maxLength={2}
              />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 220 }}>
              <span>标识图片地址（可选）</span>
              <input
                className="input mono"
                value={form.logoImage}
                onChange={(e) => setForm({ ...form, logoImage: e.target.value })}
                placeholder="https://…/logo.png 或 /logo.png"
              />
            </label>
          </div>

          <div className="logo-preview">
            <span className="small muted">预览</span>
            <BrandMark settings={form} />
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          标识文字留空时取站点名首字；填了图片地址就用图片。建议正方形，尺寸 64×64 以上。
          默认使用站内 <code>/logo.png</code>，也可以换成本站上传的其他图片或外链。
        </p>

        <label className="field" style={{ marginTop: 12, maxWidth: 460 }}>
          <span>
            对外地址（可留空）
            {isOverride('publicBaseUrl') && <em className="ovr">已被后台覆盖</em>}
          </span>
          <input
            className="input mono"
            value={form.publicBaseUrl}
            onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
            placeholder={`留空则按请求自动推导，当前为 ${runtime.effectiveBaseUrl}`}
          />
        </label>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          留空时按访问者的 Host 与 X-Forwarded-Proto 推导，通常不需要填。
          只有在反代改写了 Host、或一个站点对应多个域名时才需要固定成主域名。
        </p>
        {isOverride('publicBaseUrl') && (
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={() => resetKey('publicBaseUrl')}>
            清空（改为自动推导）
          </button>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="login">
        <h3 style={{ fontSize: 13 }}>人机验证（GeeTest v4）</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          ID 与 KEY 都填才会启用；注册与登录都会校验。填完立即生效，不用重启。
        </p>
        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <label className="field">
            <span>
              captcha_id
              {isOverride('geetestId') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              value={form.geetestId}
              onChange={(e) => setForm({ ...form, geetestId: e.target.value })}
              placeholder="从 GeeTest 控制台复制"
            />
          </label>
          <label className="field">
            <span>
              captcha_key
              {isOverride('geetestKey') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              type="password"
              value={form.geetestKey}
              onChange={(e) => setForm({ ...form, geetestKey: e.target.value })}
              placeholder="仅服务端使用"
            />
          </label>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          当前状态：{settings.geetestId && settings.geetestKey ? '已启用' : '未配置（注册会跳过验证）'}
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="moderation">
        <h3 style={{ fontSize: 13 }}>内容审核</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          控制新帖是否先审后发。审核队列在{' '}
          <a href="/admin/audit" style={{ color: 'var(--blue)' }}>
            /admin/audit
          </a>
          ；谁能审由「身份组」里的「审核内容」权限决定。
        </p>

        <label className="field" style={{ marginTop: 10, maxWidth: 320 }}>
          <span>策略</span>
          <select
            className="input"
            value={form.postAuditMode}
            onChange={(e) => setForm({ ...form, postAuditMode: e.target.value })}
          >
            <option value="off">关闭 — 发帖即发布</option>
            <option value="ai">AI 预审 — 可疑内容转人工</option>
            <option value="all">全部人工 — 所有新帖都待审</option>
          </select>
        </label>

        {form.postAuditMode !== 'off' && (
          <>
            <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
              AI 走 OpenAI 兼容接口（`/chat/completions`）。**调用失败会一律转入人工**，不会直接放行。
            </p>

            <div className="adm-form" style={{ gridTemplateColumns: '1.4fr 1fr', marginTop: 10 }}>
              <label className="field">
                <span>接口地址</span>
                <input
                  className="input"
                  value={form.aiBaseUrl}
                  onChange={(e) => setForm({ ...form, aiBaseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="field">
                <span>模型</span>
                <input
                  className="input"
                  value={form.aiModel}
                  onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </label>
            </div>

            <label className="field" style={{ marginTop: 10, maxWidth: 520 }}>
              <span>API Key</span>
              <input
                className="input"
                type="password"
                value={form.aiApiKey}
                onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
                autoComplete="new-password"
              />
            </label>

            <label className="field" style={{ marginTop: 10, maxWidth: 520 }}>
              <span>
                审核提示词<em className="field-opt">留空用内置规则</em>
              </span>
              <textarea
                className="input textarea"
                rows={3}
                value={form.aiPrompt}
                onChange={(e) => setForm({ ...form, aiPrompt: e.target.value })}
                placeholder={'模型只需输出 {"risky":bool,"score":0-1,"labels":[],"reason":""}'}
                style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
              />
            </label>
          </>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="login">
        <h3 style={{ fontSize: 13 }}>邮箱验证码登录</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          开启后，登录页会多出「邮箱验证码」方式：输入账号绑定的邮箱，收到 6 位码即可登录，
          不用密码。验证码 10 分钟有效、一次性，同一邮箱 60 秒只能发一次、每小时最多 5 次。
        </p>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          前提是下面的 SMTP 已配通。国内常见配置：QQ 邮箱 / 163 用 465 + 授权码；
          企业邮箱多为 587 + STARTTLS。
        </p>

        <label className="check" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={form.emailLoginEnabled}
            onChange={(e) => setForm({ ...form, emailLoginEnabled: e.target.checked })}
          />
          <span>启用邮箱验证码登录</span>
        </label>

        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <label className="field">
            <span>SMTP 主机</span>
            <input
              className="input"
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              placeholder="smtp.qq.com"
            />
          </label>
          <label className="field">
            <span>端口</span>
            <input
              className="input"
              value={form.smtpPort}
              onChange={(e) => setForm({ ...form, smtpPort: e.target.value.replace(/\D/g, '').slice(0, 5) })}
              placeholder="465"
            />
          </label>
          <label className="field">
            <span>登录账号</span>
            <input
              className="input"
              value={form.smtpUser}
              onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
              placeholder="no-reply@example.com"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>授权码 / 密码</span>
            <input
              className="input"
              type="password"
              value={form.smtpPass}
              onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>发件人</span>
            <input
              className="input"
              value={form.smtpFrom}
              onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
              placeholder="留空则用上面的登录账号"
            />
          </label>
          <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
            <input
              type="checkbox"
              checked={form.smtpSecure}
              onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
            />
            <span>直连 TLS（465）；取消则用 STARTTLS（587）</span>
          </label>
        </div>

        <p className="small muted" style={{ marginTop: 8 }}>
          当前状态：
          {form.emailLoginEnabled
            ? form.smtpHost && (form.smtpFrom || form.smtpUser)
              ? '已开启'
              : '已开启但 SMTP 未填全，发送会失败'
            : '未开启'}
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="login">
        <h3 style={{ fontSize: 13 }}>第三方登录</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          ID 与 Secret 都填了才会在登录页出现对应按钮。回调地址必须与平台后台登记的**完全一致**。
        </p>

        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <label className="field">
            <span>
              GitHub Client ID
              {isOverride('githubClientId') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              value={form.githubClientId}
              onChange={(e) => setForm({ ...form, githubClientId: e.target.value })}
              placeholder="Iv1.xxxxxxxx"
            />
          </label>
          <label className="field">
            <span>
              GitHub Client Secret
              {isOverride('githubClientSecret') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              type="password"
              value={form.githubClientSecret}
              onChange={(e) => setForm({ ...form, githubClientSecret: e.target.value })}
              placeholder="仅服务端使用"
            />
          </label>
        </div>
        <p className="small muted" style={{ marginTop: 6, wordBreak: 'break-all' }}>
          回调地址：<code>{runtime.effectiveBaseUrl}/api/v1/auth/oauth/github/callback</code>
        </p>

        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
          <label className="field">
            <span>
              CNKD Client ID
              {isOverride('cnkdClientId') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              value={form.cnkdClientId}
              onChange={(e) => setForm({ ...form, cnkdClientId: e.target.value })}
              placeholder="cnkd_xxxxxxxx"
            />
          </label>
          <label className="field">
            <span>
              CNKD Client Secret
              {isOverride('cnkdClientSecret') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              type="password"
              value={form.cnkdClientSecret}
              onChange={(e) => setForm({ ...form, cnkdClientSecret: e.target.value })}
              placeholder="仅服务端使用"
            />
          </label>
        </div>
        <p className="small muted" style={{ marginTop: 6, wordBreak: 'break-all' }}>
          回调地址：<code>{runtime.effectiveBaseUrl}/api/v1/auth/oauth/cnkd/callback</code>
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="integrations">
        <h3 style={{ fontSize: 13 }}>爱发电赞助</h3>
        <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <label className="field">
            <span>
              user_id
              {isOverride('afdianUserId') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              value={form.afdianUserId}
              onChange={(e) => setForm({ ...form, afdianUserId: e.target.value })}
            />
          </label>
          <label className="field">
            <span>
              token
              {isOverride('afdianToken') && <em className="ovr">已覆盖</em>}
            </span>
            <input
              className="input mono"
              type="password"
              value={form.afdianToken}
              onChange={(e) => setForm({ ...form, afdianToken: e.target.value })}
            />
          </label>
        </div>
        <label className="field" style={{ marginTop: 10, maxWidth: 420 }}>
          <span>公开赞助页地址（可选）</span>
          <input
            className="input mono"
            value={form.afdianPageUrl}
            onChange={(e) => setForm({ ...form, afdianPageUrl: e.target.value })}
            placeholder="https://afdian.com/a/yourname"
          />
        </label>
        <p className="small muted" style={{ marginTop: 8 }}>
          当前状态：{settings.afdianUserId && settings.afdianToken ? '已连接' : '未配置'}
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="site">
        <h3 style={{ fontSize: 13 }}>功能开关</h3>
        <label className="check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={form.allowRegister}
            onChange={(e) => setForm({ ...form, allowRegister: e.target.checked })}
          />
          <span>开放注册（关闭后注册接口直接拒绝，已有账号不受影响）</span>
        </label>
        <label className="check" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={form.homeShowAnnouncements}
            onChange={(e) => setForm({ ...form, homeShowAnnouncements: e.target.checked })}
          />
          <span>首页右栏显示「最新公告」</span>
        </label>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="content">
        <h3 style={{ fontSize: 13 }}>页面文案</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          留空则使用内置默认文案。支持换行，超过两行的内容建议写短一些。
        </p>

        <label className="field" style={{ marginTop: 10, maxWidth: 520 }}>
          <span>
            登录页提示
            {isOverride('loginHint') && <em className="ovr">已覆盖</em>}
          </span>
          <textarea
            className="input textarea"
            rows={2}
            value={form.loginHint}
            onChange={(e) => setForm({ ...form, loginHint: e.target.value })}
            placeholder="登录后可发帖、评论、签署公约与进入后台。"
            maxLength={200}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
        </label>

        <label className="field" style={{ marginTop: 10, maxWidth: 520 }}>
          <span>
            登录页能力条
            <em className="field-opt">每行「标题|描述」，最多 3 条</em>
            {isOverride('loginPoints') && <em className="ovr">已覆盖</em>}
          </span>
          <textarea
            className="input textarea"
            rows={3}
            value={form.loginPoints}
            onChange={(e) => setForm({ ...form, loginPoints: e.target.value })}
            placeholder={'发帖讨论|帖子、评论与站内信\n赛事确权|约战、名单快照与仲裁\n公约共治|社区公约由成员共同签署'}
            maxLength={300}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
        </label>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          显示在登录页左侧品牌区底部。留空则自动按「当前可用的登录方式」生成。
        </p>

        <label className="field" style={{ marginTop: 10, maxWidth: 520 }}>
          <span>
            注册页提示
            {isOverride('registerHint') && <em className="ovr">已覆盖</em>}
          </span>
          <textarea
            className="input textarea"
            rows={2}
            value={form.registerHint}
            onChange={(e) => setForm({ ...form, registerHint: e.target.value })}
            placeholder="注册后即可发帖、评论与签署公约。"
            maxLength={200}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
        </label>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          站点还没有账号时，注册页会强制显示「你是第一个注册的账号」这条提示，不受此项影响。
        </p>

        <label className="field" style={{ marginTop: 12, maxWidth: 520 }}>
          <span>
            「我的」未登录提示
            {isOverride('meGuestText') && <em className="ovr">已覆盖</em>}
          </span>
          <textarea
            className="input textarea"
            rows={3}
            value={form.meGuestText}
            onChange={(e) => setForm({ ...form, meGuestText: e.target.value })}
            placeholder="留空显示默认文案：\n「我的」需要账号登录后才能查看。本站没有默认账号，第一个注册的用户会成为管理员。"
            maxLength={300}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
        </label>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="pagehints">
        <h3 style={{ fontSize: 13 }}>页面提示</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          显示在各页面标题下方；留空使用内置文案。建议一两句话，避免在手机上占太多高度。
        </p>
        <div className="seo-grid">
          {HINT_FIELDS.map((f) => (
            <label key={f.key} className="field" style={{ gridColumn: '1 / -1' }}>
              <span>
                {f.label}
                {isOverride(f.key) && <em className="ovr">已覆盖</em>}
              </span>
              <textarea
                className="input textarea"
                rows={2}
                value={String(form[f.key] ?? '')}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                maxLength={200}
                style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="seo">
        <div className="between" style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: 13 }}>SEO 与分享</h3>
          <span className="small muted">保存后立即生效</span>
        </div>
        <p className="small muted" style={{ lineHeight: 1.7 }}>
          控制搜索引擎收录、搜索结果摘要与社交分享卡片。留空项使用内置文案。
        </p>

        <div className="seo-grid">
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>首页标题</span>
            <input
              className="input"
              value={form.seoTitle}
              onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
              placeholder={`留空：${form.siteName} · 玩家社区与赛事确权`}
              maxLength={60}
            />
          </label>

          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>站点描述</span>
            <textarea
              className="input textarea"
              rows={3}
              value={form.seoDescription}
              onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              placeholder="留空使用内置文案：玩家社区 · 公会战队 · 赛事确权"
              maxLength={160}
              style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
            />
          </label>

          <label className="field">
            <span>关键词（逗号分隔）</span>
            <input
              className="input"
              value={form.seoKeywords}
              onChange={(e) => setForm({ ...form, seoKeywords: e.target.value })}
              placeholder="我的世界, Rusted Warfare, 玩家社区, 电竞"
              maxLength={200}
            />
          </label>

          <label className="field">
            <span>分享封面地址</span>
            <input
              className="input mono"
              value={form.seoOgImage}
              onChange={(e) => setForm({ ...form, seoOgImage: e.target.value })}
              placeholder="/opengraph-image.png 或 https://…"
              maxLength={500}
            />
          </label>

          <label className="field">
            <span>Google 验证码</span>
            <input
              className="input mono"
              value={form.seoVerification}
              onChange={(e) => setForm({ ...form, seoVerification: e.target.value })}
              placeholder="google-site-verification 的 content"
              maxLength={200}
            />
          </label>

          <label className="field">
            <span>Twitter 账号</span>
            <input
              className="input"
              value={form.seoTwitter}
              onChange={(e) => setForm({ ...form, seoTwitter: e.target.value })}
              placeholder="@cloudrail"
              maxLength={40}
            />
          </label>
        </div>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={form.seoIndex}
            onChange={(e) => setForm({ ...form, seoIndex: e.target.checked })}
          />
          <span>
            允许搜索引擎收录
            <em className="field-opt">关闭后全站 noindex，robots.txt 拒绝所有抓取</em>
          </span>
        </label>

        <div className="seo-preview">
          <div className="seo-preview-url">
            {(form.publicBaseUrl || 'https://your.site').replace(/\/+$/, '')}
          </div>
          <div className="seo-preview-title">
            {form.seoTitle || `${form.siteName} · 玩家社区与赛事确权`}
          </div>
          <div className="seo-preview-desc">
            {form.seoDescription || '玩家社区 · 公会战队 · 赛事确权'}
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
          描述建议 60–120 字；分享封面建议 1200×630。Google 验证码填 Search Console
          给出的 content 值即可，无需整段 HTML。
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="storage">
        <div className="between" style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: 13 }}>对象存储</h3>
          <span className="small muted">阿里云 OSS / 雨云 ROS（S3 兼容）</span>
        </div>
        <p className="small muted" style={{ lineHeight: 1.7 }}>
          默认把图片存进 PostgreSQL；切换为对象存储后，新上传的图片写入桶，
          旧图片仍可正常访问。桶可以保持私有，后端会代理读取。
        </p>

        <label className="field" style={{ marginTop: 12, maxWidth: 320 }}>
          <span>存储方式</span>
          <select
            className="input"
            value={form.storageDriver}
            onChange={(e) => {
              setForm({ ...form, storageDriver: e.target.value });
              setStorageMsg(null);
            }}
          >
            <option value="db">本地数据库（默认）</option>
            <option value="s3">对象存储（S3 兼容）</option>
          </select>
        </label>

        {form.storageDriver === 's3' && (
          <>
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => applyStoragePreset('aliyun')}>
                填入阿里云默认值
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => applyStoragePreset('rainyun')}>
                填入雨云默认值
              </button>
              <span className="small muted">
                只需再填 Bucket / AccessKey / SecretKey；阿里云大陆新用户若被限制，请填自定义域名 Endpoint
              </span>
            </div>

            <div className="seo-grid">
              <label className="field">
                <span>Endpoint</span>
                <input
                  className="input mono"
                  value={form.storageEndpoint}
                  onChange={(e) => setForm({ ...form, storageEndpoint: e.target.value })}
                  placeholder="https://s3.oss-cn-hangzhou.aliyuncs.com"
                />
              </label>
              <label className="field">
                <span>Region</span>
                <input
                  className="input mono"
                  value={form.storageRegion}
                  onChange={(e) => setForm({ ...form, storageRegion: e.target.value })}
                  placeholder="cn-hangzhou / rainyun"
                />
              </label>
              <label className="field">
                <span>Bucket</span>
                <input
                  className="input mono"
                  value={form.storageBucket}
                  onChange={(e) => setForm({ ...form, storageBucket: e.target.value })}
                  placeholder="my-bucket"
                />
              </label>
              <label className="field">
                <span>路径前缀</span>
                <input
                  className="input mono"
                  value={form.storagePathPrefix}
                  onChange={(e) => setForm({ ...form, storagePathPrefix: e.target.value })}
                  placeholder="uploads"
                />
              </label>
              <label className="field">
                <span>AccessKey</span>
                <input
                  className="input mono"
                  value={form.storageAccessKey}
                  onChange={(e) => setForm({ ...form, storageAccessKey: e.target.value })}
                  placeholder="AccessKey ID"
                />
              </label>
              <label className="field">
                <span>SecretKey</span>
                <input
                  className="input mono"
                  type="password"
                  value={form.storageSecretKey}
                  onChange={(e) => setForm({ ...form, storageSecretKey: e.target.value })}
                  placeholder="Secret Access Key"
                />
              </label>
            </div>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.storageForcePathStyle}
                onChange={(e) => setForm({ ...form, storageForcePathStyle: e.target.checked })}
              />
              <span>
                使用 Path-Style 地址
                <em className="field-opt">雨云建议开启；阿里云用默认值即可</em>
              </span>
            </label>

            <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={testStorage} disabled={storageBusy}>
                {storageBusy ? '测试中…' : '测试连接'}
              </button>
              {storageMsg && (
                <span className="small" style={{ color: storageMsg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)' }}>
                  {storageMsg.text}
                </span>
              )}
            </div>
          </>
        )}

        <p className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
          密钥保存在设置表里，请保护数据库备份。切换存储不会迁移旧图片；需要迁移时可继续用后台导出。
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="content">
        <h3 style={{ fontSize: 13 }}>页脚</h3>
        <label className="field" style={{ marginTop: 10, maxWidth: 460 }}>
          <span>
            页脚文案
            {isOverride('footerText') && <em className="ovr">已覆盖</em>}
          </span>
          <input
            className="input"
            value={form.footerText}
            onChange={(e) => setForm({ ...form, footerText: e.target.value })}
            placeholder={`留空显示「${form.siteName} · 玩家社区与赛事确权」`}
            maxLength={60}
          />
        </label>

        <label className="field" style={{ marginTop: 10, maxWidth: 320 }}>
          <span>
            备案号
            {isOverride('footerIcp') && <em className="ovr">已覆盖</em>}
          </span>
          <input
            className="input mono"
            value={form.footerIcp}
            onChange={(e) => setForm({ ...form, footerIcp: e.target.value })}
            placeholder="京ICP备00000000号-1"
            maxLength={40}
          />
        </label>

        <label className="field" style={{ marginTop: 10, maxWidth: 460 }}>
          <span>
            自定义链接<em className="field-opt">每行「名称|地址」，最多 6 条</em>
            {isOverride('footerLinks') && <em className="ovr">已覆盖</em>}
          </span>
          <textarea
            className="input textarea"
            rows={3}
            value={form.footerLinks}
            onChange={(e) => setForm({ ...form, footerLinks: e.target.value })}
            placeholder={'关于我们|/about\nGitHub|https://github.com/your-repo'}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
        </label>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          留空则使用默认链接（赞助者 / 公约 / 登录）。只接受站内路径与 http(s) 地址。
        </p>

      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }} data-section="nav">
        <div className="between" style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: 13 }}>导航</h3>
          <span className="small muted">保存后立即生效</span>
        </div>
        <NavSettings
          sidebar={form.sidebarItems}
          tabbar={form.tabbarItems}
          onChange={(key, value) => setForm({ ...form, [key]: value })}
        />
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }} data-section="system">
        <h3 style={{ fontSize: 13 }}>留在 .env 里的项（进程参数与密钥）</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          下面这些属于进程启动参数或密钥，改完需要重启服务：
        </p>
        <div className="rail-list" style={{ marginTop: 10 }}>
          <div className="rail-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span>当前生效的对外地址</span>
            <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              {runtime.effectiveBaseUrl}
            </span>
          </div>
          <div className="rail-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span>数据目录 DATA_DIR</span>
            <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              {runtime.dataDir}
            </span>
          </div>
          <div className="rail-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span>监听端口 PORT</span>
            <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              {runtime.port}
            </span>
          </div>
          <div className="rail-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span>会话密钥 SESSION_SECRET / 应急口令 ADMIN_TOKEN</span>
            <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              不配则自动生成 / 关闭
            </span>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 10, lineHeight: 1.75 }}>
          密钥以明文保存在数据目录的设置文件里，备份或共享数据目录时请一并保护。
        </p>
      </div>

      <div className="row settings-save" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy === 'all'}>
          {busy === 'all' ? '保存中…' : '保存设置'}
        </button>
        {msg && (
          <span className="small" style={{ color: msg.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
