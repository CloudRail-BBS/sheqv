import { cache } from 'react';
import { apiGetOr } from './api-client';
import { badgeOf, type BadgeMap } from './badges';

/**
 * 用户相关的**读**接口 + 纯校验函数。
 *
 * 写操作（注册 / 登录 / 改角色 / 分配徽章）都在客户端组件里直接 POST `/api/v1/**`，
 * 不再经过这里——服务端组件里写 Cookie 也写不了。
 */

export type Role = 'admin' | 'member';
export type Provider = 'github' | 'cnkd';

/** 身份组的展示快照：名字与颜色，权限判定永远在后端 */
export interface UserGroup {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  isAdmin: boolean;
  createdAt: number;
  /** 仅后台列表带 */
  lastLoginAt?: number;
  notifReadAt?: number;
  banned?: boolean;
  title?: string;
  /** 身份组 id（未分组时不返回） */
  groupId?: string;
  /** 身份组的名字与颜色（未分组时不返回） */
  group?: UserGroup;
  /** 发布过资源后自动获得 */
  developer?: boolean;
  developerSince?: number;
  /** 个人主页背景图 */
  profileBg?: string;
  email?: string;
  providers?: string[];
  badges?: string[];
}

/** 兼容旧调用点：后端返回的就是公开字段 */
export type UserRecord = PublicUser;

export function toPublic(u: PublicUser): PublicUser {
  return u;
}

export interface RegisterInput {
  username?: string;
  nickname?: string;
  password?: string;
  email?: string;
}

/** 校验注册入参，返回中文错误；合法返回 null（与后端文案一致） */
export function validateRegister(input: RegisterInput): string | null {
  const username = input.username?.trim() ?? '';
  const nickname = input.nickname?.trim() ?? '';
  const password = input.password ?? '';

  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) return '用户名需 3–20 位，仅限字母、数字、下划线、短横线';
  if (nickname.length < 2 || nickname.length > 16) return '昵称需 2–16 字';
  if (password.length < 8 || password.length > 64) return '密码需 8–64 位';
  const email = (input.email ?? '').trim();
  if (email && !isEmail(email)) return '邮箱格式不正确';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return '密码需同时包含字母和数字';
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function normalizeEmail(v?: string | null): string {
  const t = (v ?? '').trim().toLowerCase();
  return t && isEmail(t) ? t : '';
}

/** 后台用户列表（含 email / banned / lastLoginAt） */
export async function listUsers(): Promise<PublicUser[]> {
  const d = await apiGetOr<{ items: PublicUser[] }>('/api/v1/admin/users', { items: [] });
  return d.items;
}

/**
 * 公开用户列表（作者徽标 / 身份组批量渲染用，不含 email）。
 * 一页里徽标表和身份组表都要它，请求内只取一次。
 */
export const listPublicUsers = cache(async (): Promise<PublicUser[]> => {
  const d = await apiGetOr<{ items: PublicUser[] }>('/api/v1/users', { items: [] });
  return d.items;
});

export async function countUsers(): Promise<number> {
  const d = await apiGetOr<{ userCount: number }>('/api/v1/auth/state', { userCount: 0 });
  return d.userCount;
}

export async function hasAnyUser(): Promise<boolean> {
  const d = await apiGetOr<{ initialized: boolean }>('/api/v1/auth/state', { initialized: false });
  return d.initialized;
}

export async function countAdmins(): Promise<number> {
  const d = await apiGetOr<{ adminCount: number }>('/api/v1/admin/users', { adminCount: 0 });
  return d.adminCount;
}

/**
 * 徽标表：`id:u123` / `name:风蚀` 双键。
 * 头衔来自账号，判定在 `badges.ts` 纯函数里，所以只需要一份公开用户列表。
 */
export async function getBadgeMap(): Promise<BadgeMap> {
  const users = await listPublicUsers();
  const map: BadgeMap = {};
  for (const u of users) {
    const info = badgeOf(u);
    if (!info) continue;
    map[`id:${u.id}`] = info;
    map[`name:${u.nickname}`] = info;
  }
  return map;
}

export async function findById(id: string): Promise<PublicUser | null> {
  const d = await apiGetOr<{ user: PublicUser | null }>(`/api/v1/users/${encodeURIComponent(id)}`, {
    user: null,
  });
  return d.user ?? null;
}
