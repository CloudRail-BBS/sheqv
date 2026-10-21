'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '@/lib/settings';

type Key = keyof SiteSettings;

interface Props {
  settings: SiteSettings;
  overrides: Partial<Record<Key, string | boolean>>;
  /** 只读展示：这些必须留在环境变量里 */
  runtime: { effectiveBaseUrl: string; dataDir: string; port: string };
}

export function SettingsForm({ settings, overrides, runtime }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState<Key | 'all' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isOverride = (k: Key) => Object.prototype.hasOwnProperty.call(overrides, k);

  async function save() {
    setBusy('all');
    setMsg(null);
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteName: form.siteName,
        publicBaseUrl: form.publicBaseUrl,
        geetestId: form.geetestId,
        geetestKey: form.geetestKey,
        afdianUserId: form.afdianUserId,
        afdianToken: form.afdianToken,
        afdianPageUrl: form.afdianPageUrl,
        allowRegister: form.allowRegister,
        homeShowAnnouncements: form.homeShowAnnouncements,
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
    <>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
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

      <div className="card card-pad" style={{ marginBottom: 12 }}>
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

      <div className="card card-pad" style={{ marginBottom: 12 }}>
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

      <div className="card card-pad" style={{ marginBottom: 12 }}>
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

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy === 'all'}>
          {busy === 'all' ? '保存中…' : '保存设置'}
        </button>
        {msg && (
          <span className="small" style={{ color: msg.kind === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>
            {msg.text}
          </span>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 13 }}>留在 .env 里的项（进程参数与密钥）</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          下面这些要么改了必须重启进程，要么不该写进数据卷，所以只在
          <code>web/.env</code>（systemd 则是 <code>/etc/blockarena/web.env</code>）里改：
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
          环境变量仍可当默认值：上面那些项在后台留空时会回落到同名变量，方便「配置即代码」。
          但后台一旦填了，就以后台为准。
        </p>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          GeeTest KEY 与爱发电 token 会以明文存进 <code>$DATA_DIR/settings.json</code>，备份时注意保护该文件。
        </p>
      </div>
    </>
  );
}
