import { apiGetOr } from './api-client';
import type { AppRelease } from './app-release-types';

export async function latestRelease(platform: string, channel = 'stable'): Promise<AppRelease | null> {
  const d = await apiGetOr<{ item: AppRelease | null }>(
    `/api/v1/app/latest?platform=${encodeURIComponent(platform)}&channel=${encodeURIComponent(channel)}`,
    { item: null },
  );
  return d.item ?? null;
}

export async function listAllReleases(): Promise<AppRelease[]> {
  const d = await apiGetOr<{ items: AppRelease[] }>('/api/v1/admin/apps', { items: [] });
  return d.items;
}
