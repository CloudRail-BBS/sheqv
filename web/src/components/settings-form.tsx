'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '@/lib/settings';

type Key = keyof SiteSettings;

interface Props {
  settings: SiteSettings;
  overrides: Partial<Record<Key, string | boolean>>;
  /** 只读展示：这些必须留在环境变量里 */
  runtime: { publicBaseUrl: string; dataDir: string; port: string };
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
            恢复环境变量
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
        <h3 style={{ fontSize: 13 }}>只能改环境变量的项</h3>
        <p className="small muted" style={{ marginTop: 6, lineHeight: 1.75 }}>
          这几项在进程启动前就要确定，或属于密钥，放后台会有风险，所以只在 `.env` 里改：
        </p>
        <div className="rail-list" style={{ marginTop: 10 }}>
          <div className="rail-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span>对外地址 PUBLIC_BASE_URL</span>
            <span className="mono small" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              {runtime.publicBaseUrl}
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
              仅环境变量
            </span>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          GeeTest KEY 与爱发电 token 会以明文存进 `$DATA_DIR/settings.json`，备份时注意保护该文件。
        </p>
      </div>
    </>
  );
}
