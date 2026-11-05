'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface PaperColumn {
  id: string;
  name: string;
  slug: string;
  count: number;
}

/**
 * 报刊工具条：选区间、选栏目、打印。
 *
 * 只负责改 URL —— 版面是服务端按参数拼的，刷新/分享链接都能还原同一期。
 */
export function PaperToolbar({
  from,
  to,
  columns,
  selected,
  total,
}: {
  from: string;
  to: string;
  columns: PaperColumn[];
  selected: string[];
  total: number;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [picked, setPicked] = useState<string[]>(selected);

  function apply(nextFrom = start, nextTo = end, nextPicked = picked) {
    const q = new URLSearchParams();
    q.set('from', nextFrom);
    q.set('to', nextTo);
    if (nextPicked.length > 0) q.set('cols', nextPicked.join(','));
    router.push(`/news/paper?${q.toString()}`);
  }

  function toggle(slug: string) {
    setPicked((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
  }

  return (
    <div className="paper-toolbar">
      <div className="paper-toolbar-row paper-range">
        <span className="paper-cols-label">区间</span>
        <div className="paper-range-fields">
          <input
            type="date"
            value={start}
            aria-label="起始日期"
            onChange={(e) => setStart(e.target.value)}
          />
          <span className="paper-dash">–</span>
          <input type="date" value={end} aria-label="结束日期" onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button type="button" className="btn btn-sm btn-primary paper-generate" onClick={() => apply()}>
          生成这一期
        </button>
        <span className="paper-toolbar-count">共 {total} 篇</span>
        <button
          type="button"
          className="btn btn-sm paper-print"
          onClick={() => window.print()}
          disabled={total === 0}
        >
          打印 / 存为 PDF
        </button>
      </div>

      <div className="paper-toolbar-row paper-cols">
        <span className="paper-cols-label">栏目</span>
        {columns.map((c) => (
          <label key={c.id} className="paper-check">
            <input type="checkbox" checked={picked.includes(c.slug)} onChange={() => toggle(c.slug)} />
            <span>{c.name}</span>
          </label>
        ))}
        {picked.length === 0 && <span className="small muted">没选 = 全部</span>}
      </div>

      <p className="paper-tip">打印时选「另存为 PDF」就是电子报，A4 纵向即可。</p>
    </div>
  );
}
