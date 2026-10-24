'use client';

import { useCallback, useEffect, useState } from 'react';

interface Group {
  id: string;
  name: string;
  slug: string;
  color: string;
  weight: number;
  isDefault: boolean;
  isBuiltin: boolean;
  permissions: string[];
  requiredAgreements: string[];
  memberCount: number;
}

interface PermOption {
  key: string;
  label: string;
}

interface AgreementOption {
  id: string;
  title: string;
}

const EMPTY = {
  name: '',
  slug: '',
  color: '#3e7cff',
  weight: 10,
  isDefault: false,
  permissions: [] as string[],
  requiredAgreements: [] as string[],
};

type Draft = typeof EMPTY;

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export function AdminGroups() {
  const [items, setItems] = useState<Group[]>([]);
  const [perms, setPerms] = useState<PermOption[]>([]);
  const [agreements, setAgreements] = useState<AgreementOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/admin/groups', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: '读取身份组失败' });
      return;
    }
    const data = (await res.json()) as { items: Group[]; permissions: PermOption[]; agreements: AgreementOption[] };
    setItems(data.items);
    setPerms(data.permissions);
    setAgreements(data.agreements);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMsg(null);

    const body = {
      name: draft.name,
      slug: draft.slug,
      color: draft.color,
      weight: draft.weight,
      isDefault: draft.isDefault,
      permissions: draft.permissions,
      requiredAgreements: draft.requiredAgreements,
    };

    const res = await fetch(editing ? `/api/v1/admin/groups/${editing}` : '/api/v1/admin/groups', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);

    setBusy(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '保存失败' });
      return;
    }

    setMsg({ kind: 'ok', text: editing ? '已保存' : '已创建' });
    setDraft(null);
    setEditing(null);
    void load();
  }

  async function remove(id: string) {
    if (!confirm('删除后该组成员会自动回到默认身份组，确定？')) return;
    const res = await fetch(`/api/v1/admin/groups/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setMsg({ kind: 'err', text: data?.message ?? '删除失败' });
      return;
    }
    setMsg({ kind: 'ok', text: '已删除' });
    void load();
  }

  function startEdit(g: Group) {
    setEditing(g.id);
    setDraft({
      name: g.name,
      slug: g.slug,
      color: g.color || '#3e7cff',
      weight: g.weight,
      isDefault: g.isDefault,
      permissions: g.permissions,
      requiredAgreements: g.requiredAgreements,
    });
  }

  return (
    <>
      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'muted'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}

      <div className="between" style={{ marginTop: 14 }}>
        <h3 style={{ fontSize: 13 }}>现有身份组</h3>
        {!draft && (
          <button className="btn btn-sm btn-primary" onClick={() => { setDraft({ ...EMPTY }); setEditing(null); }}>
            新建身份组
          </button>
        )}
      </div>

      <div className="card" style={{ marginTop: 8, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>标识</th>
              <th>成员</th>
              <th>权限</th>
              <th>需签公约</th>
              <th style={{ width: 130 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <b>{g.name}</b>
                    {g.isDefault && <span className="badge">默认</span>}
                    {g.isBuiltin && <span className="badge">内置</span>}
                  </span>
                </td>
                <td className="mono small">{g.slug}</td>
                <td className="mono">{g.memberCount}</td>
                <td className="small muted">
                  {g.permissions.length === 0
                    ? '无'
                    : g.permissions
                        .map((p) => perms.find((x) => x.key === p)?.label ?? p)
                        .join('、')}
                </td>
                <td className="small muted">
                  {g.requiredAgreements.length === 0
                    ? '—'
                    : g.requiredAgreements
                        .map((id) => agreements.find((a) => a.id === id)?.title ?? id)
                        .join('、')}
                </td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => startEdit(g)}>
                      编辑
                    </button>
                    {!g.isBuiltin && (
                      <button className="btn btn-sm btn-ghost" onClick={() => remove(g.id)}>
                        删除
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="small muted">
                  还没有身份组
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 13 }}>{editing ? '编辑身份组' : '新建身份组'}</h3>

          <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
            <label className="field">
              <span>名称</span>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="审核员"
                maxLength={20}
              />
            </label>
            <label className="field">
              <span>标识{editing && <em className="field-opt">创建后不可改</em>}</span>
              <input
                className="input"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="reviewer"
                disabled={Boolean(editing)}
                maxLength={24}
              />
            </label>
            <label className="field">
              <span>权重（大的排前面）</span>
              <input
                className="input"
                value={draft.weight}
                onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
            <label className="field">
              <span>标识颜色</span>
              <input
                className="input"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                placeholder="#3e7cff"
              />
            </label>
          </div>

          <label className="check" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
            />
            <span>新注册用户默认加入（全局只能有一个）</span>
          </label>

          <p className="small muted" style={{ marginTop: 14 }}>权限</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {perms.map((p) => (
              <label key={p.key} className="check">
                <input
                  type="checkbox"
                  checked={draft.permissions.includes(p.key)}
                  onChange={() => setDraft({ ...draft, permissions: toggle(draft.permissions, p.key) })}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>

          <p className="small muted" style={{ marginTop: 14 }}>进入该组前必须签署的公约</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {agreements.map((a) => (
              <label key={a.id} className="check">
                <input
                  type="checkbox"
                  checked={draft.requiredAgreements.includes(a.id)}
                  onChange={() =>
                    setDraft({ ...draft, requiredAgreements: toggle(draft.requiredAgreements, a.id) })
                  }
                />
                <span>{a.title}</span>
              </label>
            ))}
            {agreements.length === 0 && <span className="small muted">还没有生效中的公约</span>}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 18 }}>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setDraft(null); setEditing(null); }}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
