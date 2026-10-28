'use client';

import { useCallback, useEffect, useState } from 'react';
import { initialOf } from '@/lib/initials';

interface Entry {
  id: string;
  kind: 'person' | 'partner';
  name: string;
  role: string;
  bio: string;
  avatar: string;
  url: string;
  sort: number;
  visible: boolean;
}

const blank = (kind: 'person' | 'partner') => ({
  name: '',
  role: '',
  bio: '',
  avatar: '',
  url: '',
  sort: 0,
  visible: true,
  kind,
});

/**
 * 「关于社区」后台：介绍文案 + 成员 + 合作单位。
 *
 * 文案走设置接口（aboutIntro / aboutJoin），名单走 about 接口。
 * 两个名单共用一套组件，靠 kind 区分：人员用 bio，合作单位用 url。
 */
export function AdminAbout({ intro, join }: { intro: string; join: string }) {
  const [introText, setIntroText] = useState(intro);
  const [joinText, setJoinText] = useState(join);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const saveText = useCallback(async () => {
    setBusy(true);
    const res = await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aboutIntro: introText, aboutJoin: joinText }),
    }).catch(() => null);
    setBusy(false);
    setMsg(
      res?.ok
        ? { kind: 'ok', text: '已保存，前台立即生效' }
        : { kind: 'err', text: '保存失败，请重试' },
    );
  }, [introText, joinText]);

  return (
    <>
      {msg && <p className={msg.kind === 'ok' ? 'console-msg ok' : 'console-msg err'}>{msg.text}</p>}

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <h3 className="console-h3">站点介绍</h3>
        <p className="small muted" style={{ marginTop: 4, lineHeight: 1.75 }}>
          显示在「关于社区」顶部。空行分段，最多 2000 字。
        </p>
        <label className="field" style={{ marginTop: 10 }}>
          <span>介绍正文</span>
          <textarea
            className="input textarea"
            rows={6}
            maxLength={2000}
            value={introText}
            placeholder="这个社区是什么、为谁而建、能在这里做什么…"
            onChange={(e) => setIntroText(e.target.value)}
          />
        </label>
        <label className="field" style={{ marginTop: 10 }}>
          <span>加入说明（右栏）</span>
          <textarea
            className="input textarea"
            rows={4}
            maxLength={800}
            value={joinText}
            placeholder="怎么加入、需要准备什么、有什么门槛…"
            onChange={(e) => setJoinText(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => void saveText()}
        >
          {busy ? '保存中…' : '保存文案'}
        </button>
      </div>

      <EntrySection
        kind="person"
        title="社区成员"
        hint="头像留空时用名字首字；「职责」显示在名字下方。"
      />
      <EntrySection
        kind="partner"
        title="合作单位"
        hint="填了链接会整块可点，建议带上对方 logo 或首字标识。"
      />
    </>
  );
}

function EntrySection({ kind, title, hint }: { kind: 'person' | 'partner'; title: string; hint: string }) {
  const [items, setItems] = useState<Entry[]>([]);
  const [draft, setDraft] = useState(blank(kind));
  const [editing, setEditing] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/about?kind=${kind}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setErr('读取失败（需要管理员权限）');
      return;
    }
    const data = (await res.json()) as { items: Entry[] };
    setItems(data.items ?? []);
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!draft.name.trim()) {
      setErr('名称不能为空');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await fetch('/api/v1/admin/about', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, kind }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr('添加失败');
      return;
    }
    setDraft(blank(kind));
    void load();
  }

  async function save(item: Entry) {
    setBusy(true);
    setErr('');
    const res = await fetch(`/api/v1/admin/about/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        role: item.role,
        bio: item.bio,
        avatar: item.avatar,
        url: item.url,
        sort: item.sort,
        visible: item.visible,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr('保存失败');
      return;
    }
    setEditing(null);
    void load();
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`/api/v1/admin/about/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setErr('删除失败');
      return;
    }
    void load();
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="console-card-head">
        <div>
          <h3 className="console-h3">{title}</h3>
          <p className="small muted" style={{ marginTop: 2 }}>
            {hint}
          </p>
        </div>
        <span className="badge badge-ghost">{items.length} 条</span>
      </div>

      <div className="about-admin-list">
        {items.length === 0 && <p className="small muted" style={{ padding: '4px 16px 12px' }}>还没有条目。</p>}

        {items.map((item) =>
          editing?.id === item.id ? (
            <div key={item.id} className="about-admin-row" data-editing="true">
              <div className="about-admin-fields">
                <input
                  className="input"
                  value={editing.name}
                  placeholder="名称"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <input
                  className="input"
                  value={editing.role}
                  placeholder={kind === 'person' ? '职责 / 头衔' : '一句话说明'}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                />
                <input
                  className="input"
                  value={editing.avatar}
                  placeholder="头像 / logo 地址（可空）"
                  onChange={(e) => setEditing({ ...editing, avatar: e.target.value })}
                />
                {kind === 'person' ? (
                  <input
                    className="input"
                    value={editing.bio}
                    placeholder="简介（可空）"
                    onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                  />
                ) : (
                  <input
                    className="input"
                    value={editing.url}
                    placeholder="链接 https://…（可空）"
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  />
                )}
                <div className="row" style={{ gap: 8 }}>
                  <label className="row" style={{ gap: 4 }}>
                    <span className="small muted">排序</span>
                    <input
                      className="input"
                      type="number"
                      style={{ width: 72 }}
                      value={editing.sort}
                      onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="row" style={{ gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={editing.visible}
                      onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
                    />
                    <span className="small">显示</span>
                  </label>
                </div>
              </div>
              <div className="about-admin-acts">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void save(editing)}>
                  保存
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div key={item.id} className="about-admin-row">
              <span className="about-admin-mark">
                {item.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.avatar} alt="" />
                ) : (
                  initialOf(item.name)
                )}
              </span>
              <div className="about-admin-main">
                <b>{item.name}</b>
                <span className="small muted">
                  {item.role || '—'}
                  {kind === 'partner' && item.url ? ` · ${item.url}` : ''}
                </span>
              </div>
              {!item.visible && <span className="badge badge-ghost">已隐藏</span>}
              <div className="about-admin-acts">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(item)}>
                  编辑
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void remove(item.id)}>
                  删除
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="about-admin-add">
        <input
          className="input"
          value={draft.name}
          placeholder={kind === 'person' ? '成员名字' : '单位名称'}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          className="input"
          value={draft.role}
          placeholder={kind === 'person' ? '职责 / 头衔' : '一句话说明'}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
        />
        {kind === 'person' ? (
          <input
            className="input"
            value={draft.bio}
            placeholder="简介（可空）"
            onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          />
        ) : (
          <input
            className="input"
            value={draft.url}
            placeholder="链接 https://…（可空）"
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        )}
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void create()}>
          添加
        </button>
      </div>

      {err && <p className="console-msg err" style={{ padding: '0 16px 10px' }}>{err}</p>}
    </div>
  );
}
