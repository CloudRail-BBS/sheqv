import { ApiError, apiGet, apiGetOr } from './api-client';
import type { AppRelease } from './app-release-types';

export async function latestRelease(platform: string, channel = 'stable'): Promise<AppRelease | null> {
  const d = await apiGetOr<{ item: AppRelease | null }>(
    `/api/v1/app/latest?platform=${encodeURIComponent(platform)}&channel=${encodeURIComponent(channel)}`,
    { item: null },
  );
  return d.item ?? null;
}

/**
 * 后台版本列表。
 *
 * 不能用 `apiGetOr` —— 它会把 404 / 500 吞成空数组，页面就会显示「还没有发布任何版本」，
 * 让人误以为数据为空，其实是接口没部署。这里把失败原因一并交给页面展示。
 */
export async function listAllReleases(): Promise<{ items: AppRelease[]; error: string | null }> {
  try {
    const d = await apiGet<{ items: AppRelease[] }>('/api/v1/admin/apps');
    return { items: d.items ?? [], error: null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return {
        items: [],
        error: '后端缺少 /api/v1/admin/apps 接口（404），需要重新编译并部署 API 服务',
      };
    }
    const status = e instanceof ApiError ? e.status : 0;
    return {
      items: [],
      error: status
        ? `读取版本列表失败（HTTP ${status}），请检查 API 日志`
        : '读取版本列表失败：API 服务不可达',
    };
  }
}
