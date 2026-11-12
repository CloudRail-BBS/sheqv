'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 外部条目详情页的「收录进资源库」。
 *
 * 只有管理员能点（服务端也校验），收录完直接跳到站内资源详情页；
 * 收录之后列表里的外站原卡就不会再出现了。
 */
export function RemoteCollect({
  source,
  sourceId,
  projectId,
  title,
  summary,
  icon,
  url,
  kind,
  downloads,
}: {
  source: string;
  sourceId: string;
  projectId: number;
  title: string;
  summary: string;
  icon: string;
  url: string;
  kind: string;
  downloads: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function collect() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/v1/resources/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source,
        sourceId,
        projectId,
        title,
        summary,
        icon,
        url,
        kind,
        downloads,
        author: '',
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; id?: string; message?: string }
      | null;
    setBusy(false);
    if (!res?.ok || !data?.id) {
      setMsg(data?.message ?? '收录失败，稍后再试');
      return;
    }
    router.push(`/resources/${data.id}`);
    router.refresh();
  }

  return (
    <div className="res-collect">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void collect()}>
        {busy ? '正在收录…' : '收录进资源库'}
      </button>
      {msg && <p className="small res-cells-msg">{msg}</p>}
    </div>
  );
}
