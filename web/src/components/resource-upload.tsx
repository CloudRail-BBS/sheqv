'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RESOURCE_CATEGORIES, RESOURCE_GAMES, RESOURCE_LICENSES } from '@/lib/resource-types';

interface TeamOption {
  id: string;
  name: string;
  tag: string;
}

const EMPTY = {
  title: '',
  summary: '',
  body: '',
  game: 'minecraft',
  category: '地图',
  tags: '',
  teamId: '',
  url: '',
  version: '',
  license: '作者保留',
  sizeMb: '',
};

/**
 * 发布资源。
 *
 * 发布是开放的：登录即可，第一个资源落库后自动获得开发者身份（后端处理）。
 * 这里只做必要的防呆，真正的校验在 `resources::validate`。
 */
export function ResourceUpload({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    const tags = form.tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6);

    const sizeMb = Number(form.sizeMb);
    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      body: form.body.trim(),
      game: form.game,
      category: form.category,
      tags,
      teamId: form.teamId || null,
      url: form.url.trim(),
      version: form.version.trim(),
      license: form.license,
      sizeBytes: Number.isFinite(sizeMb) && sizeMb > 0 ? Math.round(sizeMb * 1024 * 1024) : 0,
    };

    const res = await fetch('/api/v1/resources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { message?: string } | null;
      setErr(data?.message ?? '发布失败，稍后再试');
      return;
    }
    const data = (await res.json()) as { item: { id: string } };
    router.push(`/resources/${data.item.id}`);
    router.refresh();
  }

  return (
    <form className="card card-pad res-form" onSubmit={submit}>
      <div className="between" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 18 }}>发布资源</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            发布后立即可见并开始计数；第一个资源会自动点亮「开发者」身份。
          </p>
        </div>
        <Link href="/resources" className="btn btn-sm btn-ghost">
          返回资源库
        </Link>
      </div>

      <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>标题</span>
          <input
            className="input"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="例如：云轨红石工具箱"
            maxLength={60}
            required
          />
        </label>

        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>一句话简介</span>
          <input
            className="input"
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
            placeholder="这个资源解决什么问题，适合谁"
            maxLength={200}
          />
        </label>

        <label className="field">
          <span>游戏</span>
          <select className="input" value={form.game} onChange={(e) => set('game', e.target.value)}>
            {RESOURCE_GAMES.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>分类</span>
          <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
            {RESOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>版本</span>
          <input
            className="input"
            value={form.version}
            onChange={(e) => set('version', e.target.value)}
            placeholder="1.0.0"
            maxLength={24}
          />
        </label>

        <label className="field">
          <span>授权方式</span>
          <select className="input" value={form.license} onChange={(e) => set('license', e.target.value)}>
            {RESOURCE_LICENSES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>

        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>下载地址（http / https）</span>
          <input
            className="input mono"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://…/resource.zip"
            required
          />
        </label>

        <label className="field">
          <span>文件大小（MB，可留空）</span>
          <input
            className="input"
            value={form.sizeMb}
            onChange={(e) => set('sizeMb', e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="12.5"
          />
        </label>

        <label className="field">
          <span>标签（逗号分隔，最多 6 个）</span>
          <input
            className="input"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="红石, 模板, 1.20"
          />
        </label>

        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>以团队名义发布（可选）</span>
          <select className="input" value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
            <option value="">个人名义</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}（{t.tag}）</option>
            ))}
          </select>
        </label>

        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>详细介绍</span>
          <textarea
            className="input textarea"
            rows={6}
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            placeholder="安装方式、依赖、已知问题…"
            maxLength={5000}
          />
        </label>
      </div>

      {err && <p className="small auth-err" style={{ marginTop: 10 }}>{err}</p>}

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? '发布中…' : '发布资源'}
        </button>
        <span className="small muted">发布即表示你有权分发该资源。</span>
      </div>
    </form>
  );
}
