import type { MetadataRoute } from 'next';
import { getSiteMeta } from '@/lib/seo';
import { listPosts } from '@/lib/forum-store';
import { listOrgs } from '@/lib/orgs';
import { listAnnouncements } from '@/lib/announcement-store';
import { listChangelog } from '@/lib/changelog-store';
import { listResources } from '@/lib/resource-store';
import { listDevTeams } from '@/lib/dev-team-store';

/**
 * 动态 sitemap：静态入口 + 帖子 + 公会 / 战队 + 公告 + 更新日志。
 *
 * 只收**公开可索引**的内容：待审帖、被拒帖、个人页、后台一律不进。
 * 每条列表都限流（前 200），避免站点长大之后一次生成几万个 URL。
 */
export const dynamic = 'force-dynamic';

const LIMIT = 200;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSiteMeta();
  if (!site.baseUrl) return [];

  const base = site.baseUrl.replace(/\/+$/, '');
  const url = (path: string) => `${base}${path}`;
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: url('/servers'), lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: url('/leaderboard'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: url('/guilds'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: url('/teams'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: url('/announcements'), lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: url('/points'), lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: url('/changelog'), lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: url('/resources'), lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: url('/matches'), lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
    { url: url('/sponsors'), lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
    { url: url('/agreements'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  const [posts, guilds, teams, news, logs, resources, devTeams] = await Promise.all([
    listPosts(),
    listOrgs('guild'),
    listOrgs('team'),
    listAnnouncements({ publishedOnly: true }),
    listChangelog(),
    listResources(),
    listDevTeams(),
  ]);

  for (const p of posts) {
    if (p.status && p.status !== 'published') continue;
    entries.push({
      url: url(`/p/${p.id}`),
      lastModified: new Date(p.createdAt),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
    if (entries.length >= 1000) break;
  }

  for (const g of guilds.slice(0, LIMIT)) {
    entries.push({ url: url(`/guilds/${g.id}`), lastModified: now, changeFrequency: 'weekly', priority: 0.6 });
  }
  for (const t of teams.slice(0, LIMIT)) {
    entries.push({ url: url(`/teams/${t.id}`), lastModified: now, changeFrequency: 'weekly', priority: 0.6 });
  }
  for (const a of news.slice(0, LIMIT)) {
    entries.push({
      url: url(`/announcements/${a.id}`),
      lastModified: new Date(a.updatedAt || a.createdAt),
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }
  for (const r of resources.slice(0, LIMIT)) {
    entries.push({
      url: url(`/resources/${r.id}`),
      lastModified: new Date(r.updatedAt || r.createdAt),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }
  for (const t of devTeams.slice(0, LIMIT)) {
    entries.push({
      url: url(`/dev-teams/${t.id}`),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }
  for (const c of logs.slice(0, LIMIT)) {
    entries.push({
      url: url(`/changelog#${c.id}`),
      lastModified: new Date(c.releasedAt),
      changeFrequency: 'monthly',
      priority: 0.3,
    });
  }

  return entries;
}
