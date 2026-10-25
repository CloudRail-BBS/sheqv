/**
 * 分享图 / 证书的绘制。
 *
 * 为什么用 Canvas 2D 而不是「渲染 DOM 再截图」：
 * 截图要靠第三方库（html2canvas 之类），本项目零 UI 依赖，也不该为了三张图引一个；
 * Canvas 画出来的就是最终像素，没有字体/布局抖动，导出 PNG 只需 `toBlob`。
 *
 * 所有函数都返回已经画好的 `HTMLCanvasElement`，调用方负责下载。
 * 只在浏览器里用（导入方都是 'use client' 组件）。
 */

import type { ShareRow } from './org-types';

export type { ShareRow };

export interface ShareOrg {
  id: string;
  kind: 'guild' | 'team';
  name: string;
  tag: string;
  game: string;
  gameLabel: string;
  intro: string;
  owner: string;
  status: string;
  statusLabel: string;
  points: number;
  wins: number;
  losses: number;
  winRate: number;
  members: number;
  createdAt: number;
}

const C = {
  bg: '#f3f5f9',
  panel: '#ffffff',
  ink: '#151a23',
  ink2: '#3d4757',
  muted: '#6b7688',
  line: '#e3e8f0',
  blue: '#3e7cff',
  blueSoft: '#e8f0ff',
  gold: '#b8860b',
};

const FONT = '"PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Consolas, monospace';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas');
  ctx.textBaseline = 'alphabetic';
  return [el, ctx];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface TextOpts {
  size?: number;
  weight?: number | string;
  color?: string;
  align?: CanvasTextAlign;
  font?: string;
  maxWidth?: number;
}

/** 画一行字，超宽自动省略号（社交图里长名字必须截断，不能溢出） */
function write(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: TextOpts = {},
) {
  const {
    size = 24,
    weight = 400,
    color = C.ink,
    align = 'left',
    font = FONT,
    maxWidth,
  } = opts;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;

  let text = str;
  if (maxWidth && ctx.measureText(text).width > maxWidth) {
    const chars = [...text];
    while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxWidth) {
      chars.pop();
    }
    text = chars.join('') + '…';
  }
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

/** 按宽度折行绘制，最多 `maxLines` 行，末行补省略号；返回实际行数 */
function wrap(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  opts: { size: number; weight?: number | string; color?: string; lineHeight: number },
): number {
  ctx.font = `${opts.weight ?? 400} ${opts.size}px ${FONT}`;
  const chars = [...str.replace(/\s+/g, ' ').trim()];
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    const next = cur + ch;
    if (ctx.measureText(next).width > maxWidth && cur) {
      if (lines.length === maxLines - 1) {
        cur = next;
        break;
      }
      lines.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) {
    if (lines.length === maxLines - 1 && ctx.measureText(cur).width > maxWidth) {
      let last = cur;
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
        last = last.slice(0, -1);
      }
      cur = last + '…';
    }
    lines.push(cur);
  }

  lines.forEach((line, i) => {
    write(ctx, line, x, y + i * opts.lineHeight, {
      size: opts.size,
      weight: opts.weight,
      color: opts.color,
      maxWidth,
    });
  });
  return lines.length;
}

function paintBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // 右上角蓝色光晕 + 左下角淡格子，避免大面积纯色显得像截图
  const glow = ctx.createRadialGradient(w * 0.86, h * 0.06, 0, w * 0.86, h * 0.06, w * 0.7);
  glow.addColorStop(0, 'rgba(62, 124, 255, 0.20)');
  glow.addColorStop(1, 'rgba(62, 124, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(21, 26, 35, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function crest(
  ctx: CanvasRenderingContext2D,
  tag: string,
  x: number,
  y: number,
  size: number,
  opts: { bg?: string; color?: string; radius?: number; fontSize?: number } = {},
) {
  roundRect(ctx, x, y, size, size, opts.radius ?? size * 0.24);
  ctx.fillStyle = opts.bg ?? C.blueSoft;
  ctx.fill();
  ctx.strokeStyle = 'rgba(62, 124, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const label = [...tag].slice(0, 3).join('');
  write(ctx, label, x + size / 2, y + size / 2 + (opts.fontSize ?? size * 0.3) * 0.36, {
    size: opts.fontSize ?? size * 0.3,
    weight: 700,
    color: opts.color ?? C.blue,
    align: 'center',
  });
}

function footer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  brand: string,
  date: string,
) {
  ctx.fillStyle = C.line;
  ctx.fillRect(72, h - 108, w - 144, 1);
  write(ctx, brand, 72, h - 62, { size: 22, weight: 600, color: C.ink2, maxWidth: w - 320 });
  write(ctx, date, w - 72, h - 62, { size: 20, color: C.muted, align: 'right' });
}

/** 团队头像：只加载站内路径（同源），避免 canvas 被跨域图片污染导致导出失败 */
function loadSameOriginLogo(url?: string): Promise<HTMLImageElement | null> {
  if (!url || !url.startsWith('/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (value: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
    // 图片再慢也不能卡住导出
    window.setTimeout(() => finish(null), 2500);
  });
}

function avatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  tag: string,
  color: string,
  x: number,
  y: number,
  size: number,
) {
  if (img) {
    ctx.save();
    roundRect(ctx, x, y, size, size, size * 0.24);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
    roundRect(ctx, x, y, size, size, size * 0.24);
    ctx.strokeStyle = 'rgba(21, 26, 35, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  crest(ctx, tag, x, y, size, {
    bg: color || C.blue,
    color: '#ffffff',
    fontSize: size * 0.31,
  });
}

/* ── 开发团队榜分享图 1080×1440 ─────────── */

export interface ShareDevTeamRow {
  rank: number;
  teamId: string;
  name: string;
  tag: string;
  color: string;
  logo?: string;
  members: number;
  resources: number;
  downloads: number;
  likes: number;
  score: number;
}

export async function renderDevBoardShare(opts: {
  rows: ShareDevTeamRow[];
  brand: string;
  date: string;
}): Promise<HTMLCanvasElement> {
  const W = 1080;
  const H = 1440;
  const [el, ctx] = canvas(W, H);
  paintBase(ctx, W, H);

  const top = opts.rows.slice(0, 8);
  const logos = await Promise.all(top.map((r) => loadSameOriginLogo(r.logo)));

  roundRect(ctx, 72, 76, 258, 52, 26);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  write(ctx, 'DEVELOPER TEAMS', 201, 110, {
    size: 20,
    weight: 700,
    color: C.blue,
    align: 'center',
  });

  write(ctx, '开发团队榜', 72, 236, { size: 84, weight: 700, color: C.ink });
  write(ctx, '下载 + 点赞 × 3 · 资源数 × 4 计入团队分', 76, 288, {
    size: 23,
    color: C.muted,
  });

  const gap = 14;
  const areaTop = 356;
  const areaBottom = H - 170;
  const rowH = Math.max(
    96,
    Math.min(
      190,
      Math.floor((areaBottom - areaTop - gap * Math.max(0, top.length - 1)) / Math.max(1, top.length)),
    ),
  );
  const blockH = top.length * rowH + gap * Math.max(0, top.length - 1);
  // 只有 1–3 个团队时靠上排，下面补「本期概览」，避免一张分享图中间只有一个卡片
  const startY =
    top.length <= 3
      ? areaTop + 20
      : areaTop + Math.max(0, Math.floor((areaBottom - areaTop - blockH) / 2));

  top.forEach((row, i) => {
    const y = startY + i * (rowH + gap);
    const isFirst = i === 0;

    roundRect(ctx, 72, y, W - 144, rowH, 22);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = isFirst ? 'rgba(62, 124, 255, 0.45)' : C.line;
    ctx.lineWidth = isFirst ? 3 : 2;
    ctx.stroke();

    write(ctx, String(row.rank), 116, y + rowH / 2 + 20, {
      size: 48,
      weight: 700,
      color: isFirst ? C.blue : C.muted,
      align: 'center',
      font: MONO,
    });

    avatar(ctx, logos[i], row.tag, row.color, 164, y + (rowH - 76) / 2, 76);

    write(ctx, row.name, 268, y + rowH / 2 - 6, {
      size: 34,
      weight: 600,
      color: C.ink,
      maxWidth: 430,
    });
    write(
      ctx,
      `${row.tag} · ${row.members} 成员 · ${row.resources} 个资源`,
      268,
      y + rowH / 2 + 34,
      { size: 21, color: C.muted, maxWidth: 430 },
    );

    write(ctx, String(row.score), W - 96, y + rowH / 2 + 2, {
      size: 46,
      weight: 700,
      color: C.ink,
      align: 'right',
      font: MONO,
    });
    write(ctx, '团队分', W - 96, y + rowH / 2 - 34, {
      size: 19,
      color: C.muted,
      align: 'right',
    });
    write(ctx, `↓ ${row.downloads} · ♥ ${row.likes}`, W - 96, y + rowH / 2 + 34, {
      size: 18,
      color: C.muted,
      align: 'right',
    });
  });

  if (top.length === 0) {
    write(ctx, '还没有团队上榜', W / 2, H / 2, {
      size: 32,
      weight: 600,
      color: C.muted,
      align: 'center',
    });
  }

  if (top.length > 0 && top.length <= 3) {
    const totals = top.reduce(
      (acc, row) => ({
        resources: acc.resources + row.resources,
        downloads: acc.downloads + row.downloads,
        likes: acc.likes + row.likes,
      }),
      { resources: 0, downloads: 0, likes: 0 },
    );
    const summaryY = startY + blockH + 42;
    write(ctx, '本期概览', 76, summaryY, { size: 22, weight: 600, color: C.muted });

    const cards: [string, number][] = [
      ['上榜团队', top.length],
      ['资源', totals.resources],
      ['下载', totals.downloads],
      ['点赞', totals.likes],
    ];
    const cardW = (W - 144 - 18 * 3) / 4;
    cards.forEach(([label, value], i) => {
      const x = 72 + i * (cardW + 18);
      roundRect(ctx, x, summaryY + 24, cardW, 118, 18);
      ctx.fillStyle = C.panel;
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      write(ctx, String(value), x + 20, summaryY + 88, {
        size: 42,
        weight: 700,
        color: C.ink,
        font: MONO,
      });
      write(ctx, label, x + 20, summaryY + 118, { size: 19, color: C.muted });
    });
  }

  footer(ctx, W, H, opts.brand, opts.date);
  return el;
}

/* ── 榜单分享图 1080×1440 ─────────────────── */

export function renderLeaderboardShare(opts: {
  title: string;
  gameLabel: string;
  rows: ShareRow[];
  brand: string;
  date: string;
}): HTMLCanvasElement {
  const W = 1080;
  const H = 1440;
  const [el, ctx] = canvas(W, H);
  paintBase(ctx, W, H);

  // 顶部胶囊
  roundRect(ctx, 72, 76, 236, 52, 26);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  write(ctx, `赛季榜 · ${opts.gameLabel}`, 190, 110, {
    size: 22,
    weight: 600,
    color: C.blue,
    align: 'center',
  });

  write(ctx, opts.title, 72, 236, { size: 84, weight: 700, color: C.ink });
  write(ctx, `按积分排序 · 共 ${opts.rows.length} 个条目`, 76, 288, {
    size: 24,
    color: C.muted,
  });

  const top = opts.rows.slice(0, 8);
  const gap = 14;
  const areaTop = 356;
  const areaBottom = H - 170;
  // 行高随条目数自适应：只有 3 名时把行撑开并整体居中，
  // 否则底部会留出一大片空白，像没画完。
  const rowH = Math.max(
    96,
    Math.min(190, Math.floor((areaBottom - areaTop - gap * (top.length - 1)) / Math.max(1, top.length))),
  );
  const blockH = top.length * rowH + gap * (top.length - 1);
  const startY = areaTop + Math.max(0, Math.floor((areaBottom - areaTop - blockH) / 2));

  top.forEach((row, i) => {
    const y = startY + i * (rowH + gap);
    const isFirst = i === 0;

    roundRect(ctx, 72, y, W - 144, rowH, 22);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = isFirst ? 'rgba(62, 124, 255, 0.45)' : C.line;
    ctx.lineWidth = isFirst ? 3 : 2;
    ctx.stroke();

    // 名次
    write(ctx, String(row.rank), 116, y + rowH / 2 + 20, {
      size: 48,
      weight: 700,
      color: isFirst ? C.blue : C.muted,
      align: 'center',
      font: MONO,
    });

    crest(ctx, row.tag, 164, y + (rowH - 76) / 2, 76, {
      bg: isFirst ? C.blue : C.blueSoft,
      color: isFirst ? '#ffffff' : C.blue,
      fontSize: 26,
    });

    write(ctx, row.name, 268, y + rowH / 2 - 6, {
      size: 34,
      weight: 600,
      color: C.ink,
      maxWidth: 420,
    });
    write(
      ctx,
      `${row.game} · ${row.wins}胜${row.losses}负 · 胜率 ${row.wins + row.losses ? Math.round(row.winRate * 100) : 0}%`,
      268,
      y + rowH / 2 + 34,
      { size: 21, color: C.muted, maxWidth: 420 },
    );

    write(ctx, String(row.points), W - 96, y + rowH / 2 + 4, {
      size: 46,
      weight: 700,
      color: C.ink,
      align: 'right',
      font: MONO,
    });
    write(ctx, '积分', W - 96, y + rowH / 2 + 34, {
      size: 19,
      color: C.muted,
      align: 'right',
    });
  });

  footer(ctx, W, H, opts.brand, opts.date);
  return el;
}

/* ── 公会 / 战队信息分享卡 1080×1350 ─────── */

export function renderOrgCard(org: ShareOrg, brand: string, date: string): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const [el, ctx] = canvas(W, H);
  paintBase(ctx, W, H);

  const kindLabel = org.kind === 'guild' ? '公会' : '战队';

  roundRect(ctx, 72, 72, W - 144, H - 144, 36);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  crest(ctx, org.tag, 132, 140, 168, { radius: 44, fontSize: 62 });

  write(ctx, org.name, 340, 232, { size: 64, weight: 700, color: C.ink, maxWidth: 560 });
  write(ctx, `${org.gameLabel} · ${kindLabel} · ${org.statusLabel}`, 344, 282, {
    size: 24,
    color: C.muted,
    maxWidth: 560,
  });

  // 负责人
  write(ctx, `负责人 ${org.owner || '—'}`, 344, 336, {
    size: 22,
    color: C.ink2,
    maxWidth: 560,
  });

  // 简介：最多 3 行，超长省略
  wrap(ctx, org.intro || `这个${kindLabel}还没有写简介。`, 132, 470, W - 264, 3, {
    size: 26,
    color: C.ink2,
    lineHeight: 44,
  });

  // 数据块
  const stats: [string, string][] = [
    ['积分', String(org.points)],
    ['场次', String(org.wins + org.losses)],
    ['胜率', org.wins + org.losses ? `${Math.round(org.winRate * 100)}%` : '—'],
    ['成员', String(org.members)],
  ];
  const boxY = 640;
  const boxW = (W - 264 - 3 * 20) / 4;
  stats.forEach(([label, value], i) => {
    const x = 132 + i * (boxW + 20);
    roundRect(ctx, x, boxY, boxW, 168, 24);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    write(ctx, value, x + boxW / 2, boxY + 88, {
      size: 46,
      weight: 700,
      color: C.ink,
      align: 'center',
      font: MONO,
    });
    write(ctx, label, x + boxW / 2, boxY + 130, {
      size: 20,
      color: C.muted,
      align: 'center',
    });
  });

  // 证书式尾部
  ctx.fillStyle = C.line;
  ctx.fillRect(132, 900, W - 264, 1);
  write(ctx, '成立于', 132, 958, { size: 20, color: C.muted });
  write(ctx, new Date(org.createdAt).toISOString().slice(0, 10), 132, 1000, {
    size: 30,
    weight: 600,
    color: C.ink2,
    font: MONO,
  });

  write(ctx, '编号', W / 2 + 40, 958, { size: 20, color: C.muted });
  write(ctx, org.id.toUpperCase(), W / 2 + 40, 1000, {
    size: 26,
    weight: 600,
    color: C.ink2,
    font: MONO,
    maxWidth: 300,
  });

  write(ctx, brand, 132, 1180, { size: 26, weight: 600, color: C.ink });
  write(ctx, date, W - 132, 1180, { size: 20, color: C.muted, align: 'right' });
  return el;
}

/* ── 负责人证书 1600×1131（A4 横向） ─────── */

/** 证书编号：ASCII、稳定、不可枚举；同一签名每次生成一致 */
export function certSerial(prefix: string, seed: string): string {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${prefix}-${h.toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`;
}

export const DEFAULT_CERT_DISCLAIMER =
  '本证书由站内数据自动生成，仅证明相关账号在签发时的站内状态或签署行为，不构成官方资质、营业执照或法律意见；具体权利义务以站内《用户协议》《免责声明》为准。';

export function renderCertificate(
  org: ShareOrg,
  ownerName: string,
  brand: string,
  date: string,
  disclaimer: string = DEFAULT_CERT_DISCLAIMER,
  stamp?: HTMLImageElement | null,
): HTMLCanvasElement {
  const W = 1600;
  const H = 1131;
  const [el, ctx] = canvas(W, H);

  ctx.fillStyle = '#fbfcfe';
  ctx.fillRect(0, 0, W, H);

  // 双线边框
  ctx.strokeStyle = 'rgba(62, 124, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = 'rgba(21, 26, 35, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(62, 62, W - 124, H - 124);

  // 四角装饰
  const corner = (x: number, y: number, sx: number, sy: number) => {
    ctx.strokeStyle = C.blue;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + sy * 46);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * 46, y);
    ctx.stroke();
  };
  corner(62, 62, 1, 1);
  corner(W - 62, 62, -1, 1);
  corner(62, H - 62, 1, -1);
  corner(W - 62, H - 62, -1, -1);

  const kindLabel = org.kind === 'guild' ? '公会' : '战队';

  write(ctx, brand, W / 2, 176, {
    size: 22,
    weight: 600,
    color: C.muted,
    align: 'center',
  });
  write(ctx, `${kindLabel}负责人证书`, W / 2, 300, {
    size: 76,
    weight: 700,
    color: C.ink,
    align: 'center',
  });
  write(ctx, 'CERTIFICATE OF OWNERSHIP', W / 2, 348, {
    size: 20,
    color: C.muted,
    align: 'center',
    font: MONO,
  });

  ctx.fillStyle = C.blue;
  ctx.fillRect(W / 2 - 40, 386, 80, 4);

  write(ctx, '兹证明', 200, 500, { size: 26, color: C.ink2 });
  write(ctx, ownerName || '—', 320, 506, { size: 40, weight: 700, color: C.blue, maxWidth: 620 });

  write(ctx, `为${kindLabel}「${org.name}」（${org.tag}）的创建者与负责人，`, 200, 590, {
    size: 26,
    color: C.ink2,
    maxWidth: W - 400,
  });
  write(
    ctx,
    `该${kindLabel}登记于 ${org.gameLabel}，自 ${new Date(org.createdAt).toISOString().slice(0, 10)} 起在站内有效。`,
    200,
    642,
    { size: 26, color: C.ink2, maxWidth: W - 400 },
  );

  // 编号与状态
  write(ctx, '编号', 200, 742, { size: 20, color: C.muted });
  write(ctx, org.id.toUpperCase(), 200, 782, {
    size: 30,
    weight: 600,
    color: C.ink,
    font: MONO,
    maxWidth: 420,
  });
  write(ctx, '当前状态', 760, 742, { size: 20, color: C.muted });
  write(ctx, org.statusLabel, 760, 782, { size: 30, weight: 600, color: C.ink });

  // 核验提示
  write(ctx, '可在站内「负责人证书」页核验', 200, 860, {
    size: 18,
    color: C.muted,
  });

  // 落款
  write(ctx, brand, 200, 920, { size: 26, weight: 600, color: C.ink });
  write(ctx, '运营团队', 200, 958, { size: 20, color: C.muted });
  write(ctx, date, W - 200, 920, { size: 26, weight: 600, color: C.ink, align: 'right' });
  write(ctx, '签发日期', W - 200, 958, { size: 20, color: C.muted, align: 'right' });

  // 免责声明
  ctx.strokeStyle = 'rgba(21, 26, 35, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(200, 986);
  ctx.lineTo(W - 200, 986);
  ctx.stroke();
  write(ctx, '免责声明', 200, 1010, { size: 16, weight: 600, color: C.ink2 });
  wrap(ctx, disclaimer, 200, 1036, W - 400, 2, {
    size: 14,
    color: C.muted,
    lineHeight: 18,
  });

  // 水印徽记
  ctx.globalAlpha = 0.06;
  crest(ctx, org.tag, W - 380, 470, 300, { radius: 76, fontSize: 110 });
  ctx.globalAlpha = 1;

  // 印章：叠在落款区域，不挡住编号与正文
  if (stamp && stamp.complete && stamp.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    // 印章压在签发日期上方，右对齐落款区
    // 骑缝章：压在签发日期上，底部不遮住免责声明
    ctx.drawImage(stamp, W - 330, 830, 160, 160);
    ctx.restore();
  }

  return el;
}


/* ── 公约签署证书 1600×1131（A4 横向） ───── */

export function renderAgreementCertificate(
  agreement: { id: string; title: string; version: string; scope: string },
  nickname: string,
  signedAt: string,
  brand: string,
  date: string,
  disclaimer: string = DEFAULT_CERT_DISCLAIMER,
  stamp?: HTMLImageElement | null,
): HTMLCanvasElement {
  const W = 1600;
  const H = 1131;
  const [el, ctx] = canvas(W, H);

  ctx.fillStyle = '#fbfcfe';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(62, 124, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = 'rgba(21, 26, 35, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(62, 62, W - 124, H - 124);

  const corner = (x: number, y: number, sx: number, sy: number) => {
    ctx.strokeStyle = C.blue;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + sy * 46);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * 46, y);
    ctx.stroke();
  };
  corner(62, 62, 1, 1);
  corner(W - 62, 62, -1, 1);
  corner(62, H - 62, 1, -1);
  corner(W - 62, H - 62, -1, -1);

  write(ctx, brand, W / 2, 176, { size: 22, weight: 600, color: C.muted, align: 'center' });
  write(ctx, '公约签署证书', W / 2, 300, {
    size: 76,
    weight: 700,
    color: C.ink,
    align: 'center',
  });
  write(ctx, 'CERTIFICATE OF AGREEMENT', W / 2, 348, {
    size: 20,
    color: C.muted,
    align: 'center',
    font: MONO,
  });

  ctx.fillStyle = C.blue;
  ctx.fillRect(W / 2 - 40, 386, 80, 4);

  write(ctx, '兹证明', 200, 500, { size: 26, color: C.ink2 });
  write(ctx, nickname || '—', 320, 506, { size: 40, weight: 700, color: C.blue, maxWidth: 620 });
  write(ctx, `已阅读并同意《${agreement.title}》${agreement.version} 的全部条款，`, 200, 590, {
    size: 26,
    color: C.ink2,
    maxWidth: W - 400,
  });
  write(ctx, `并于 ${signedAt} 完成站内签署。`, 200, 642, {
    size: 26,
    color: C.ink2,
    maxWidth: W - 400,
  });

  write(ctx, '证书编号', 200, 742, { size: 20, color: C.muted });
  write(ctx, certSerial(`AGR-${agreement.id.toUpperCase()}`, nickname), 200, 782, {
    size: 30,
    weight: 600,
    color: C.ink,
    font: MONO,
    maxWidth: 560,
  });
  write(ctx, '适用范围', 860, 742, { size: 20, color: C.muted });
  write(ctx, agreement.scope, 860, 782, { size: 24, color: C.ink, maxWidth: 400 });

  write(ctx, '可在站内「公约」页核验签署记录', 200, 860, { size: 18, color: C.muted });

  write(ctx, brand, 200, 920, { size: 26, weight: 600, color: C.ink });
  write(ctx, '运营团队', 200, 958, { size: 20, color: C.muted });
  write(ctx, date, W - 200, 920, { size: 26, weight: 600, color: C.ink, align: 'right' });
  write(ctx, '签发日期', W - 200, 958, { size: 20, color: C.muted, align: 'right' });

  ctx.strokeStyle = 'rgba(21, 26, 35, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(200, 986);
  ctx.lineTo(W - 200, 986);
  ctx.stroke();
  write(ctx, '免责声明', 200, 1010, { size: 16, weight: 600, color: C.ink2 });
  wrap(ctx, disclaimer, 200, 1036, W - 400, 2, {
    size: 14,
    color: C.muted,
    lineHeight: 18,
  });

  ctx.globalAlpha = 0.06;
  crest(ctx, '约', W - 380, 470, 300, { radius: 76, fontSize: 110 });
  ctx.globalAlpha = 1;

  if (stamp && stamp.complete && stamp.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    // 印章压在签发日期上方，右对齐落款区
    // 骑缝章：压在签发日期上，底部不遮住免责声明
    ctx.drawImage(stamp, W - 330, 830, 160, 160);
    ctx.restore();
  }

  return el;
}

/* ── 下载 ───────────────────────────────── */

export function downloadCanvas(el: HTMLCanvasElement, filename: string) {
  el.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 立刻 revoke 会让部分浏览器下载失败，延后一点
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}

/** 文件名里不能有斜杠与引号，中文可以保留 */
export function safeName(raw: string): string {
  return raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
