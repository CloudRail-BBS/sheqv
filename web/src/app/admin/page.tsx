import Link from 'next/link';
import { getRequestCaps } from '@/lib/request-caps';
import { getAdminGate } from '@/lib/admin-auth';
import { AdminDenied } from '@/components/admin-denied';
import { LogoutButton } from '@/components/logout-button';
import { MATCHES } from '@/lib/data';

const AUDIT = [
  { at: '14:02:11', actor: 'admin@ops', action: '关闭 UGC 入口', target: 'feature:ugc_post', ip: '10.2.4.18' },
  { at: '13:47:02', actor: 'referee@ops', action: '裁定争议', target: 'm-2038 → 待补充证据', ip: '10.2.4.22' },
  { at: '12:15:39', actor: 'admin@ops', action: '下架资源', target: 'res:legacy-pack（侵权）', ip: '10.2.4.18' },
  { at: '11:03:07', actor: 'moderator@ops', action: '封禁账号', target: 'u_88213（7 天）', ip: '10.2.4.31' },
];

export default async function AdminPage() {
  const gate = await getAdminGate();

  // 没有默认管理员：未登录或非 admin 角色一律拦在渲染之前
  if (!gate.ok) {
    return (
      <div className="col-main">
        <AdminDenied loggedIn={Boolean(gate.user)} nickname={gate.user?.nickname} />
      </div>
    );
  }

  const caps = await getRequestCaps();

  if (!caps.capabilities.admin.console) {
    return (
      <div className="col-main">
        <div className="card card-pad" style={{ borderColor: '#4d2323', background: 'rgba(248,113,113,0.05)', marginTop: 6 }}>
          <h1 style={{ fontSize: 17 }}>403 · 管理后台仅桌面端可用</h1>
          <p className="small dim" style={{ marginTop: 8 }}>
            当前 runtime = <code className="mono">{caps.runtime}</code>，
            <code className="mono">cap.admin.console = false</code>。该限制由服务端拦截。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-main">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">管理后台</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            仲裁、审核、封禁与审计。全部操作留痕，按角色权限位鉴权（不是按端能力）。
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/admin/agreements" className="btn btn-sm">
            公约管理
          </Link>
          <Link href="/admin/sponsors" className="btn btn-sm">
            赞助管理
          </Link>
          <span className="badge badge-live">{gate.user?.nickname} · 管理员</span>
          <LogoutButton className="btn btn-sm btn-ghost" />
        </div>
      </div>

      {caps.form === 'mobile' && (
        <div className="notice">
          <span>窄屏下管理后台仍可用，但仲裁与批量审核建议在桌面完成——表格会横向滚动。</span>
        </div>
      )}

        <div className="guild-grid" style={{ marginTop: 20 }}>
          {[
            { k: '待仲裁', v: '3', s: '最长等待 6h' },
            { k: '待审核内容', v: '18', s: '帖子 12 / 资源 6' },
            { k: '今日举报', v: '7', s: '已处理 5' },
          ].map((s) => (
            <div key={s.k} className="card card-pad">
              <div className="small muted">{s.k}</div>
              <div style={{ fontSize: 28, letterSpacing: '-0.03em', marginTop: 4 }}>{s.v}</div>
              <div className="small muted">{s.s}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 18, overflow: 'hidden' }}>
          <div className="between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 14 }}>争议仲裁台</h3>
            <span className="small muted">仅此页面可执行裁定</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>比赛</th>
                <th>状态</th>
                <th>提交比分</th>
                <th>举证截止</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {MATCHES.filter((m) => m.status === 'disputed' || m.status === 'submitted').map((m) => (
                <tr key={m.id}>
                  <td>
                    <div>{m.title}</div>
                    <div className="small muted mono">{m.id}</div>
                  </td>
                  <td>
                    <span className={'badge ' + (m.status === 'disputed' ? 'badge-danger' : 'badge-warn')}>
                      {m.status === 'disputed' ? '争议中' : '待确认'}
                    </span>
                  </td>
                  <td className="mono">
                    {m.guildA.score} : {m.guildB.score}
                  </td>
                  <td className="small muted">{m.deadline}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost">进入</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: 18, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <h3 style={{ fontSize: 14 }}>审计日志</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>动作</th>
                <th>对象</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT.map((a) => (
                <tr key={a.at + a.action}>
                  <td className="mono muted">{a.at}</td>
                  <td className="mono">{a.actor}</td>
                  <td>{a.action}</td>
                  <td className="dim">{a.target}</td>
                  <td className="mono muted">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}
