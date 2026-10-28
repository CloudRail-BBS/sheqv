import { cache } from 'react';
import { apiGetOr } from './api-client';

export interface AboutEntry {
  id: string;
  kind: 'person' | 'partner';
  name: string;
  role: string;
  bio: string;
  avatar: string;
  url: string;
  sort: number;
  visible: boolean;
}

export interface AboutData {
  intro: string;
  join: string;
  people: AboutEntry[];
  partners: AboutEntry[];
}

const EMPTY: AboutData = { intro: '', join: '', people: [], partners: [] };

/** 关于社区：介绍、成员、合作单位一次取齐 */
export const getAbout = cache(async (): Promise<AboutData> => {
  const data = await apiGetOr<Partial<AboutData>>('/api/v1/about', {});
  return {
    intro: data.intro ?? '',
    join: data.join ?? '',
    people: data.people ?? [],
    partners: data.partners ?? [],
  };
});

export { EMPTY as EMPTY_ABOUT };
