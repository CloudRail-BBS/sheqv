'use client';

import { useEffect, useRef } from 'react';
import {
  renderCertificate,
  renderLeaderboardShare,
  renderOrgCard,
  type ShareOrg,
} from '@/lib/share-image';
import { toShareRow, type Org } from '@/lib/org-types';

const SAMPLE_ORGS: Org[] = [
  { id: 'gmvm47f0gkhvc', kind: 'guild', name: '极东重工', tag: '极东', game: 'minecraft', intro: '红石与建筑见长，周中训练，周末打公会战。招人要求：能稳定上线、听指挥。', owner: '榜测1', ownerId: 'u1', status: 'recruiting', points: 58, wins: 21, losses: 4, members: 52, winRate: 21 / 25, createdAt: 1792829182912 },
  { id: 'gmvm470e9qj5m', kind: 'guild', name: '星轨联萌', tag: '星轨', game: 'minecraft', intro: '主玩生存与红石，晚上八点后活跃。', owner: '冒烟1792820638', ownerId: 'u2', status: 'training', points: 42, wins: 18, losses: 6, members: 37, winRate: 0.75, createdAt: 1792829163975 },
  { id: 'gmvm47f8ulw2b', kind: 'guild', name: '南风俱乐部', tag: '南风', game: 'minecraft', intro: '新人友好，周末团建。', owner: '榜测2', ownerId: 'u3', status: 'rest', points: 26, wins: 10, losses: 9, members: 24, winRate: 10 / 19, createdAt: 1792829183214 },
];

const SAMPLE_TEAMS: Org[] = [
  { id: 'tmvm47fgw61qk', kind: 'team', name: '极东一队', tag: 'JF1', game: 'minecraft', intro: '', owner: '榜测1', ownerId: 'u1', status: 'recruiting', points: 45, wins: 16, losses: 3, members: 10, winRate: 16 / 19, createdAt: 1792829183504 },
  { id: 'tmvm470u8dchu', kind: 'team', name: '星轨突击队', tag: 'XG', game: 'rusted_warfare', intro: '4v4 快速反应，主打欧洲图。', owner: '冒烟1792820638', ownerId: 'u2', status: 'recruiting', points: 33, wins: 12, losses: 5, members: 8, winRate: 12 / 17, createdAt: 1792829164544 },
];

function toShareOrg(o: Org): ShareOrg {
  return {
    ...o,
    gameLabel: o.game === 'minecraft' ? '我的世界' : 'Rusted Warfare',
    statusLabel: o.status === 'recruiting' ? '招募中' : o.status === 'training' ? '训练中' : '休赛',
  };
}

/**
 * 开发预览：把三张导出的图直接画在页面上，方便调版式。
 * 生产环境由 `ENABLE_DEV_CONSOLE` 控制（和 /dev/capabilities 同一开关）。
 */
export function SharePreview() {
  const board = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cert = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rows = SAMPLE_ORGS.map((o, i) => toShareRow(o, i + 1, 'MC'));
    const canvases = [
      { host: board.current, el: renderLeaderboardShare({ title: '公会榜', gameLabel: '我的世界', rows, brand: '云轨社区 · 排行榜', date: '2026-10-24' }) },
      { host: card.current, el: renderOrgCard(toShareOrg(SAMPLE_ORGS[0]), '云轨社区', '2026-10-24') },
      { host: cert.current, el: renderCertificate(toShareOrg(SAMPLE_ORGS[0]), '榜测1', '云轨社区', '2026-10-24') },
    ];
    for (const { host, el } of canvases) {
      if (!host) continue;
      host.replaceChildren(el);
      el.style.width = '100%';
      el.style.height = 'auto';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 10px 30px -20px rgba(0,0,0,.5)';
      el.style.display = 'block';
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <section>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>榜单分享图 1080×1440</h2>
        <div ref={board} />
      </section>
      <section>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>公会信息卡 1080×1350</h2>
        <div ref={card} />
      </section>
      <section>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>负责人证书 1600×1131</h2>
        <div ref={cert} />
      </section>
      <p className="small muted">
        预览用的样例数据（{SAMPLE_TEAMS.length} 支战队仅用于核对多行排版）。真实导出走页面上的按钮。
      </p>
    </div>
  );
}
