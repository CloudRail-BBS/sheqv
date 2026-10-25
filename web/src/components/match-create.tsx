'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicUser } from '@/lib/users';
import type { Org } from '@/lib/org-types';
import type { MatchView } from '@/lib/match-types';

const FORMATS = ['BO1', 'BO3', 'BO5', '1v1', '3v3', '4v4'];

function key(o: Org) {
  return `${o.kind}:${o.id}`;
}

function orgByKey(list: Org[], value: string): Org | undefined {
  return list.find((o) => key(o) === value);
}

function defaultTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 发起约战：自己必须是公会/战队负责人，并先签署诚信公约 */
export function MatchCreate({
  user,
  trustSigned,
  myOrgs,
  allOrgs,
}: {
  user: PublicUser | null;
  trustSigned: boolean;
  myOrgs: Org[];
  allOrgs: Org[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creatorKey, setCreatorKey] = useState(myOrgs[0] ? key(myOrgs[0]) : '');
  const [opponentKey, setOpponentKey] = useState('');
  const [format, setFormat] = useState('BO3');
  const [when, setWhen] = useState(defaultTime);
  const [title, setTitle] = useState('');
  const [maps, setMaps] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const creator = orgByKey(myOrgs, creatorKey);
  const opponents = useMemo(
    () =>
      allOrgs.filter(
        (o) =>
          o.game === creator?.game &&
          o.ownerId !== user?.id &&
          !(o.kind === creator?.kind && o.id === creator?.id),
      ),
    [allOrgs, creator, user?.id],
  );
  const opponent = orgByKey(opponents, opponentKey);

  function openModal() {
    setErr(null);
    setOpen(true);
  }

  async function submit() {
    if (busy) return;
    setErr(null);
    if (!creator || !opponent) {
      setErr('请选择自己的组织和对手');
      return;
    }
    if (!when) {
      setErr('请选择开赛时间');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/v1/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creatorKind: creator.kind,
        creatorOrgId: creator.id,
        opponentKind: opponent.kind,
        opponentOrgId: opponent.id,
        format,
        scheduledAt: new Date(when).toISOString(),
        title: title.trim(),
        maps: maps
          .split(/[,，\n]/)
          .map((m) => m.trim())
          .filter(Boolean)
          .slice(0, 5),
        note: note.trim(),
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { item?: MatchView; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.item) {
      setErr(data?.message ?? '发起失败，请稍后再试');
      return;
    }
    setOpen(false);
    router.push(`/matches/${data.item.id}`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={openModal}>
        发起约战
      </button>

      {open && (
        <div className="modal-mask" onClick={() => !busy && setOpen(false)}>
          <div className="modal match-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: 17 }}>发起约战</h3>
                <p className="small muted" style={{ marginTop: 4 }}>
                  对方负责人接受后锁定名单，再进入比赛与结果确认。
                </p>
              </div>
              <button className="composer-icon-btn" aria-label="关闭" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            {!user ? (
              <div className="hint-box" style={{ marginTop: 16 }}>
                发起约战需要登录。<Link href="/login" style={{ color: 'var(--blue)' }}>去登录</Link>
              </div>
            ) : !trustSigned ? (
              <div className="hint-box" style={{ marginTop: 16 }}>
                发起约战前需要先签署《诚信公约》。{' '}
                <Link href="/agreements" style={{ color: 'var(--blue)' }}>去签署</Link>
              </div>
            ) : myOrgs.length === 0 ? (
              <div className="hint-box" style={{ marginTop: 16 }}>
                你还没有公会或战队。{' '}
                <Link href="/guilds" style={{ color: 'var(--blue)' }}>创建公会</Link>
                {' / '}
                <Link href="/teams" style={{ color: 'var(--blue)' }}>创建战队</Link>
              </div>
            ) : (
              <>
                <div className="seo-grid" style={{ marginTop: 16 }}>
                  <label className="field">
                    <span>我方组织</span>
                    <select
                      className="input"
                      value={creatorKey}
                      onChange={(e) => {
                        setCreatorKey(e.target.value);
                        setOpponentKey('');
                      }}
                    >
                      {myOrgs.map((o) => (
                        <option key={key(o)} value={key(o)}>
                          [{o.kind === 'guild' ? '公会' : '战队'}] {o.name}（{o.tag}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>对手组织</span>
                    <select
                      className="input"
                      value={opponentKey}
                      onChange={(e) => setOpponentKey(e.target.value)}
                    >
                      <option value="">选择对手</option>
                      {opponents.map((o) => (
                        <option key={key(o)} value={key(o)}>
                          [{o.kind === 'guild' ? '公会' : '战队'}] {o.name}（{o.tag}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>赛制</span>
                    <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
                      {FORMATS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>开赛时间</span>
                    <input
                      className="input"
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                    />
                  </label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    <span>标题（可留空，自动生成）</span>
                    <input
                      className="input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={creator && opponent ? `${creator.name} vs ${opponent.name}` : '例如：周末友谊赛'}
                      maxLength={60}
                    />
                  </label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    <span>地图（逗号分隔，最多 5 个）</span>
                    <input
                      className="input"
                      value={maps}
                      onChange={(e) => setMaps(e.target.value)}
                      placeholder="极地、沙漠、随机"
                    />
                  </label>
                  <label className="field" style={{ gridColumn: '1 / -1' }}>
                    <span>备注</span>
                    <textarea
                      className="input textarea"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="集合方式、语音频道、特殊规则……"
                      maxLength={500}
                      style={{ height: 'auto', padding: '8px 10px', resize: 'vertical' }}
                    />
                  </label>
                </div>

                {err && <div className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}

                <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                    取消
                  </button>
                  <button className="btn btn-primary" onClick={submit} disabled={busy}>
                    {busy ? '发起中…' : '发起约战'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
