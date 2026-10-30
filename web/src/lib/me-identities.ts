import { apiGetOr } from './api-client';

/** 已绑定的第三方身份（后端 `identities` 表的一条记录） */
export interface Identity {
  provider: string;
  login: string;
  avatar?: string | null;
}

export interface IdentityState {
  items: Identity[];
  /** 有没有设过密码；没有密码时不允许解绑最后一个第三方 */
  hasPassword: boolean;
  /** 后台是否配置了对应平台（没配置就不显示绑定按钮） */
  providers: { github: boolean; cnkd: boolean };
}

export async function getIdentities(): Promise<IdentityState> {
  return apiGetOr<IdentityState>('/api/v1/me/identities', {
    items: [],
    hasPassword: true,
    providers: { github: false, cnkd: false },
  });
}
