'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TASK_KIND_LABEL,
  TASK_METRIC_LABEL,
  type TaskKind,
  type UserTask,
} from '@/lib/task-types';

const ORDER: TaskKind[] = ['daily', 'weekly', 'once'];

/**
 * 任务中心：按周期分组，进度条 + 领取。
 *
 * 进度由后端按当期实时统计，这里不做乐观加数——领取成功后用返回值刷新余额，
 * 并 `router.refresh()` 让顶栏积分同步。
 */
export function TaskCenter({
  initial,
  initialPoints,
}: {
  initial: UserTask[];
  initialPoints: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [points, setPoints] = useState(initialPoints);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function claim(task: UserTask) {
    if (busy) return;
    setBusy(task.id);
    setMsg(null);
    const res = await fetch(`/api/v1/tasks/${encodeURIComponent(task.id)}/claim`, {
      method: 'POST',
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { points?: number; message?: string }
      | null;
    setBusy(null);
    if (!res?.ok) {
      setMsg({ kind: 'err', text: data?.message ?? '领取失败，稍后再试' });
      return;
    }
    if (typeof data?.points === 'number') setPoints(data.points);
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, claimed: true, claimable: false } : t)));
    setMsg({ kind: 'ok', text: `已领取 ${task.rewardPoints} 积分` });
    router.refresh();
  }

  return (
    <div className="task-page">
      <div className="task-head">
        <div>
          <span className="rw-kicker">TASKS</span>
          <h1 className="page-title">任务中心</h1>
          <p className="rw-sub">
            签到、发帖、评论、上传资源都会推进进度。每日 / 每周按上海时区重置，领过的不会重复计。
          </p>
        </div>
        <div className="task-balance">
          <span>当前积分</span>
          <b className="mono">{points}</b>
        </div>
      </div>

      {msg && (
        <p className={`small ${msg.kind === 'err' ? 'auth-err' : 'ok-text'}`} style={{ marginBottom: 4 }}>
          {msg.text}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card rw-empty">
          <b>还没有任务</b>
          <p>管理员配置任务后会出现在这里。</p>
        </div>
      ) : (
        ORDER.filter((kind) => items.some((t) => t.kind === kind)).map((kind) => (
          <section key={kind} className="task-group">
            <div className="task-group-head">
              <b>{TASK_KIND_LABEL[kind]}</b>
              <span className="small muted">
                {kind === 'once' ? '完成一次即可领取' : '每期自动重置'}
              </span>
            </div>
            <div className="task-list">
              {items
                .filter((t) => t.kind === kind)
                .map((t) => {
                  const pct = Math.min(100, Math.round((t.progress / t.target) * 100));
                  return (
                    <article key={t.id} className="card task-row" data-done={t.progress >= t.target}>
                      <div className="task-main">
                        <div className="task-title">
                          {t.title}
                          <span className="task-metric">{TASK_METRIC_LABEL[t.metric]}</span>
                        </div>
                        {t.description && <p className="task-desc">{t.description}</p>}
                        <div className="task-progress">
                          <div className="task-bar" aria-hidden="true">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                          <span className="mono small muted">
                            {t.progress} / {t.target}
                          </span>
                        </div>
                      </div>
                      <div className="task-reward">
                        <span className="task-points mono">+{t.rewardPoints}</span>
                        <span className="small muted">积分</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        data-on={t.claimable}
                        disabled={!t.claimable || busy === t.id}
                        onClick={() => claim(t)}
                      >
                        {t.claimed ? '已领取' : busy === t.id ? '领取中…' : t.progress >= t.target ? '领取' : '未完成'}
                      </button>
                    </article>
                  );
                })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
