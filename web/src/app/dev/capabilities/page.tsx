import { getRequestCaps } from '@/lib/request-caps';
import { config } from '@/lib/config';
import { notFound } from 'next/navigation';
import {
  DEFAULTS,
  DEFAULT_LIMITS,
  WECHAT_OVERRIDES,
  flattenCaps,
  formatBytes,
  type Capabilities,
  type Limits,
} from '@/lib/capabilities';
import { ForceSwitch } from '@/components/force-switch';
import { BootstrapProbe } from '@/components/bootstrap-probe';

function withWechat(base: Capabilities): Capabilities {
  const out = JSON.parse(JSON.stringify(base)) as Capabilities;
  for (const [group, items] of Object.entries(WECHAT_OVERRIDES)) {
    Object.assign((out as unknown as Record<string, Record<string, boolean>>)[group], items);
  }
  return out;
}

const COLUMNS: { key: string; label: string; caps: Capabilities; limits: Limits }[] = [
  { key: 'web', label: 'web', caps: DEFAULTS.web, limits: DEFAULT_LIMITS.web },
  {
    key: 'wx',
    label: 'web·微信',
    caps: withWechat(DEFAULTS.web),
    limits: { ...DEFAULT_LIMITS.web, maxUploadBytes: 300 * 1024 * 1024, evidenceVideoBytes: 0 },
  },
  { key: 'android', label: 'android', caps: DEFAULTS.android, limits: DEFAULT_LIMITS.android },
  { key: 'ios', label: 'ios', caps: DEFAULTS.ios, limits: DEFAULT_LIMITS.ios },
];

function readPath(obj: unknown, path: string): boolean {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj) === true;
}

export default async function CapabilityPage() {
  // 生产默认不暴露调试页；需要在线上排查时设 ENABLE_DEV_CONSOLE=1 再重新部署
  if (!config.devConsole) notFound();

  const caps = await getRequestCaps();
  const keys = flattenCaps(DEFAULTS.web).map((k) => k.key);
  const activeKey = caps.isWeChat && caps.runtime === 'web' ? 'wx' : caps.runtime;

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">端能力台</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            单一 web 端：视口决定布局，微信环境决定少量能力。服务端判定，客户端只消费。
          </p>
        </div>
        <span className="badge mono">{keys.length} keys</span>
      </div>

      <div className="card cap-hero">
        <div>
          <div className="small muted">runtime</div>
          <div className="cap-rt">{caps.runtime}</div>
        </div>
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
          <div className="small muted">form</div>
          <div className="mono" style={{ fontSize: 15, color: 'var(--accent)' }}>{caps.form}</div>
        </div>
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
          <div className="small muted">isWeChat</div>
          <div className="mono" style={{ fontSize: 15 }}>{String(caps.isWeChat)}</div>
        </div>
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
          <div className="small muted">source</div>
          <div className="mono" style={{ fontSize: 12 }}>{caps.source}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <ForceSwitch current={caps.form} />
        </div>
      </div>

      <div className="hint-box">
        没有 <code className="mono">runtime = h5</code> 了：移动端是同一个 web 端的窄视口，布局由 CSS 断点接管。
        真正会改变能力的只有微信内置浏览器（<code className="mono">isWeChat</code>）——不能直下文件、不能传大视频、必须走 JS-SDK 分享。
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <h3 style={{ fontSize: 13 }}>能力矩阵</h3>
          <span className="small muted">高亮列 = 本次请求命中的组合</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '38%' }}>key</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={{ textAlign: 'center', color: c.key === activeKey ? 'var(--accent)' : undefined }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td className="mono" style={{ fontSize: 12 }}>{k}</td>
                  {COLUMNS.map((c) => {
                    const on = readPath(c.caps, k);
                    const cur = c.key === activeKey;
                    return (
                      <td
                        key={c.key}
                        className="mono"
                        style={{
                          textAlign: 'center',
                          background: cur ? 'var(--accent-soft)' : undefined,
                          color: on ? (cur ? 'var(--accent)' : 'var(--on-dim)') : 'var(--muted)',
                        }}
                      >
                        {on ? '●' : '○'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
          <h3 style={{ fontSize: 13 }}>配额（服务端只能下调）</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>key</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="num" style={{ color: c.key === activeKey ? 'var(--accent)' : undefined }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(DEFAULT_LIMITS.web) as (keyof Limits)[]).map((k) => (
              <tr key={k}>
                <td className="mono" style={{ fontSize: 12 }}>{k}</td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className="num"
                    style={{
                      background: c.key === activeKey ? 'var(--accent-soft)' : undefined,
                      color: c.key === activeKey ? 'var(--accent)' : undefined,
                    }}
                  >
                    {k === 'chunkConcurrency' || k === 'imagesPerPost' ? c.limits[k] : formatBytes(c.limits[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BootstrapProbe />

      <p className="small muted" style={{ lineHeight: 1.8 }}>
        能力表只驱动 UI 与配额，<b>不是鉴权</b>。上传大小、后台权限、仲裁操作都由服务端独立校验。
        强制视口写入 <code className="mono">__form</code> cookie，仅 dev 生效。
      </p>
    </div>
  );
}
