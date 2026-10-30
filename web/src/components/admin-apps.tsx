'use client';

import { useState } from 'react';
import {
  APP_CHANNELS,
  APP_PLATFORMS,
  fmtBytes,
  platformLabel,
  type AppChannel,
  type AppPlatform,
  type AppRelease,
} from '@/lib/app-release-types';

const BLANK: AppRelease = {
  id: '',
  platform: 'windows-x64',
  channel: 'stable',
  version: '',
  build: 1,
  downloadUrl: '',
  notes: '',
  forceUpdate: false,
  minVersion: '',
  published: true,
  fileSize: 0,
  sha256: '',
  createdAt: '',
  updatedAt: '',
};

export function AdminApps({
  releases,
  getui,
  listError,
}: {
  releases: AppRelease[];
  getui: { appId: string; appKey: string; appSecret: string; masterSecret: string };
  /** 读列表失败时的原因；成功为 null */
  listError?: string | null;
}) {
  const [rows, setRows] = useState(releases);
  const [form, setForm] = useState<AppRelease>(BLANK);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AppRelease | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [push, setPush] = useState(getui);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const open = creating || editing !== null;

  /** 同平台/通道下 build 必须唯一，新建时默认填「当前最大值 + 1」 */
  function nextBuild(platform: string, channel: string) {
    const max = rows
      .filter((r) => r.platform === platform && r.channel === channel)
      .reduce((m, r) => Math.max(m, r.build), 0);
    return max + 1;
  }

  function startCreate() {
    setForm({ ...BLANK, build: nextBuild(BLANK.platform, BLANK.channel) });
    setCreating(true);
    setEditing(null);
    setMsg(null);
  }
  function startEdit(r: AppRelease) {
    setForm({ ...r, fileSize: r.fileSize });
    setCreating(false);
    setEditing(r);
    setMsg(null);
  }
  function close() {
    setCreating(false);
    setEditing(null);
  }

  async function saveRelease() {
    setBusy(true);
    setMsg(null);
    const body = {
      platform: form.platform,
      channel: form.channel,
      version: form.version,
      build: form.build,
      downloadUrl: form.downloadUrl,
      notes: form.notes,
      forceUpdate: form.forceUpdate,
      minVersion: form.minVersion,
      published: form.published,
      fileSize: form.fileSize,
      sha256: form.sha256,
    };
    const res = await fetch(creating ? '/api/v1/admin/apps' : `/api/v1/admin/apps/${editing!.id}`, {
      method: creating ? 'POST' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { item?: AppRelease; message?: string }
      | null;
    setBusy(false);
    if (!res) {
      setMsg({ kind: 'err', text: '请求没有发出去，请检查网络或重新登录' });
      return;
    }
    if (res.status === 404) {
      setMsg({ kind: 'err', text: '后端缺少 /api/v1/admin/apps 接口（404），需要重新编译部署 API' });
      return;
    }
    if (res.status === 401 || res.status === 403) {
      setMsg({ kind: 'err', text: '没有管理员权限，请重新登录后再试' });
      return;
    }
    if (res.status >= 500) {
      setMsg({ kind: 'err', text: `服务端出错（HTTP ${res.status}），请查看 API 日志` });
      return;
    }
    if (res.status === 409) {
      setMsg({
        kind: 'err',
        text: `build ${form.build} 已被占用，改用 ${nextBuild(form.platform, form.channel)} 再试`,
      });
      return;
    }
    if (!res?.ok || !data?.item) {
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }
    setRows((list) =>
      creating ? [data.item!, ...list] : list.map((r) => (r.id === data.item!.id ? data.item! : r)),
    );
    setCreating(false);
    setEditing(data.item);
    setForm({ ...data.item });
    setMsg({ kind: 'ok', text: '已保存' });
  }

  async function remove(r: AppRelease) {
    if (!confirm(`删除 ${platformLabel(r.platform)} ${r.version} (${r.build})？`)) return;
    const res = await fetch(`/api/v1/admin/apps/${r.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '删除失败' });
      return;
    }
    setRows((list) => list.filter((x) => x.id !== r.id));
  }

  async function savePush() {
    setPushBusy(true);
    setPushMsg(null);
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        getuiAppId: push.appId,
        getuiAppKey: push.appKey,
        getuiAppSecret: push.appSecret,
        getuiMasterSecret: push.masterSecret,
      }),
    }).catch(() => null);
    setPushBusy(false);
    if (!res?.ok) {
      setPushMsg({ kind: 'err', text: '保存失败' });
      return;
    }
    setPushMsg({ kind: 'ok', text: '已保存，服务端发送推送时会读取' });
  }

  return (
    <div className="admin-apps">
      {listError && (
        <div
          className="card card-pad"
          style={{
            marginTop: 12,
            borderColor: 'var(--danger-line)',
            background: 'var(--danger-soft)',
          }}
        >
          <b style={{ color: 'var(--danger)', fontSize: 13 }}>读不到版本列表</b>
          <p className="small" style={{ marginTop: 5, color: 'var(--text-2)', lineHeight: 1.7 }}>
            {listError}
          </p>
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="settings-main-title" style={{ fontSize: 15 }}>客户端版本</h2>
            <p className="settings-main-desc">
              直接分发场景下由这里维护 EXE / DMG / APK 的最新版本、下载地址和强制更新规则。
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
            发布版本
          </button>
        </div>

        {open && (
          <div className="card card-pad" style={{ marginBottom: 12, background: 'var(--panel-2)' }}>
            <div className="between" style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>{creating ? '发布新版本' : `编辑 ${editing?.version}`}</b>
              <button className="btn btn-sm btn-ghost" onClick={close}>收起</button>
            </div>
            <div className="seo-grid">
              <label className="field">
                <span>平台</span>
                <select
                  className="input"
                  value={form.platform}
                  disabled={!creating}
                  onChange={(e) => {
                    const platform = e.target.value as AppPlatform;
                    setForm((f) => ({
                      ...f,
                      platform,
                      build: creating ? nextBuild(platform, f.channel) : f.build,
                    }));
                  }}
                >
                  {APP_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>通道</span>
                <select
                  className="input"
                  value={form.channel}
                  onChange={(e) => {
                    const channel = e.target.value as AppChannel;
                    setForm((f) => ({
                      ...f,
                      channel,
                      build: creating ? nextBuild(f.platform, channel) : f.build,
                    }));
                  }}
                >
                  {APP_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>版本号</span>
                <input className="input mono" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0.0" maxLength={32} />
              </label>
              <label className="field">
                <span>Build 号</span>
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  value={form.build}
                  onChange={(e) => setForm({ ...form, build: Number(e.target.value) })}
                />
                <small className="small muted" style={{ marginTop: 4 }}>
                  同一平台 / 通道内不可重复
                </small>
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>下载地址</span>
                <input className="input mono" value={form.downloadUrl} onChange={(e) => setForm({ ...form, downloadUrl: e.target.value })} placeholder="https://…/BlockArena-1.0.0.exe 或 /downloads/…" />
              </label>
              <label className="field">
                <span>文件大小（MB）</span>
                <input
                  className="input mono"
                  value={form.fileSize ? (form.fileSize / 1024 / 1024).toFixed(1) : ''}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d.]/g, ''));
                    setForm({ ...form, fileSize: Number.isFinite(n) ? Math.round(n * 1024 * 1024) : 0 });
                  }}
                  placeholder="12.5"
                />
              </label>
              <label className="field">
                <span>最低支持版本</span>
                <input className="input mono" value={form.minVersion} onChange={(e) => setForm({ ...form, minVersion: e.target.value })} placeholder="0.9.0" maxLength={32} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>SHA-256（可留空）</span>
                <input className="input mono" value={form.sha256} onChange={(e) => setForm({ ...form, sha256: e.target.value })} placeholder="64 位十六进制" maxLength={64} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>更新说明</span>
                <textarea
                  className="input textarea"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={2000}
                  style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
                />
              </label>
              <label className="switch-row" style={{ marginTop: 0 }}>
                <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                <span>发布到下载页</span>
              </label>
              <label className="switch-row" style={{ marginTop: 0 }}>
                <input type="checkbox" checked={form.forceUpdate} onChange={(e) => setForm({ ...form, forceUpdate: e.target.checked })} />
                <span>强制更新</span>
              </label>
            </div>
            {msg && <div className="small" style={{ color: msg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)', marginTop: 8 }}>{msg.text}</div>}
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={saveRelease} disabled={busy}>
                {busy ? '保存中…' : '保存版本'}
              </button>
            </div>
          </div>
        )}

        <div className="policy-admin-list">
          {rows.length === 0 && <p className="small muted">还没有发布任何客户端版本。</p>}
          {rows.map((r) => (
            <div key={r.id} className="card policy-admin-row">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
                  <b>{platformLabel(r.platform)}</b>
                  <span className="badge mono">{r.version} ({r.build})</span>
                  <span className="badge">{r.channel === 'beta' ? '测试版' : '稳定版'}</span>
                  {!r.published && <span className="badge badge-warn">未发布</span>}
                  {r.forceUpdate && <span className="badge badge-danger">强制更新</span>}
                </div>
                <p className="small muted" style={{ marginTop: 4 }}>
                  {fmtBytes(r.fileSize)} · 更新于 {r.updatedAt} · {r.downloadUrl}
                </p>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => startEdit(r)}>编辑</button>
                <button className="btn btn-sm btn-ghost" onClick={() => remove(r)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h2 className="settings-main-title" style={{ fontSize: 15 }}>个推（Android 推送）</h2>
        <p className="settings-main-desc">
          客户端用个推 SDK 注册 CID；服务端发送通知时读取这里的 AppID / AppKey / AppSecret / MasterSecret。
        </p>
        <div className="seo-grid">
          <label className="field"><span>AppID</span><input className="input mono" value={push.appId} onChange={(e) => setPush({ ...push, appId: e.target.value })} /></label>
          <label className="field"><span>AppKey</span><input className="input mono" value={push.appKey} onChange={(e) => setPush({ ...push, appKey: e.target.value })} /></label>
          <label className="field"><span>AppSecret</span><input className="input mono" type="password" value={push.appSecret} onChange={(e) => setPush({ ...push, appSecret: e.target.value })} /></label>
          <label className="field"><span>MasterSecret</span><input className="input mono" type="password" value={push.masterSecret} onChange={(e) => setPush({ ...push, masterSecret: e.target.value })} /></label>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={savePush} disabled={pushBusy}>
            {pushBusy ? '保存中…' : '保存推送配置'}
          </button>
          {pushMsg && <span className="small" style={{ color: pushMsg.kind === 'ok' ? 'var(--blue)' : 'var(--danger)' }}>{pushMsg.text}</span>}
        </div>
      </div>
    </div>
  );
}
