import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';

/**
 * 用户存储。
 *
 * - 密码用 scrypt（N=16384, r=8, p=1）加盐哈希，不存明文、不存可逆值；
 * - 第一个注册成功的用户自动成为管理员，**没有内置管理员账号**；
 * - 文件在 $DATA_DIR/users.json，单实例部署够用；换数据库时保持这组函数签名即可。
 */

export type Role = 'admin' | 'member';

export interface UserRecord {
  id: string;
  /** 登录名，小写唯一 */
  username: string;
  /** 展示名 */
  nickname: string;
  passwordHash: string;
  role: Role;
  createdAt: number;
  lastLoginAt?: number;
}

/** 对外暴露的用户信息（不含哈希） */
export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  isAdmin: boolean;
  createdAt: number;
}

interface Store {
  users: UserRecord[];
}

const FILE = dataFile('users.json');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) =>
      err ? reject(err) : resolve(key as Buffer),
    );
  });
}

/** 格式：scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (expected.length !== KEYLEN) return false;

  // 用记录里的参数重算，便于以后提高强度而不影响老用户
  const key = await new Promise<Buffer | null>((resolve) => {
    _scrypt(
      password,
      salt,
      expected.length,
      { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) },
      (err, derived) => resolve(err ? null : (derived as Buffer)),
    );
  });
  if (!key || key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

async function read(): Promise<Store> {
  const parsed = await readJson<Partial<Store>>(FILE, {});
  return { users: Array.isArray(parsed.users) ? parsed.users : [] };
}

export function toPublic(u: UserRecord): PublicUser {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    role: u.role,
    isAdmin: u.role === 'admin',
    createdAt: u.createdAt,
  };
}

export async function listUsers(): Promise<UserRecord[]> {
  return (await read()).users;
}

export async function countUsers(): Promise<number> {
  return (await read()).users.length;
}

export async function hasAnyUser(): Promise<boolean> {
  return (await countUsers()) > 0;
}

export async function findById(id: string): Promise<PublicUser | null> {
  const u = (await read()).users.find((x) => x.id === id);
  return u ? toPublic(u) : null;
}

export async function findByUsername(username: string): Promise<UserRecord | null> {
  const name = username.trim().toLowerCase();
  return (await read()).users.find((x) => x.username === name) ?? null;
}

export interface RegisterInput {
  username?: string;
  nickname?: string;
  password?: string;
}

/** 校验注册入参，返回中文错误；合法返回 null */
export function validateRegister(input: RegisterInput): string | null {
  const username = input.username?.trim() ?? '';
  const nickname = input.nickname?.trim() ?? '';
  const password = input.password ?? '';

  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) return '用户名需 3–20 位，仅限字母、数字、下划线、短横线';
  if (nickname.length < 2 || nickname.length > 16) return '昵称需 2–16 字';
  if (password.length < 8 || password.length > 64) return '密码需 8–64 位';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return '密码需同时包含字母和数字';
  return null;
}

export interface CreateResult {
  user: PublicUser;
  /** 是否因为是第一个用户而被授予管理员 */
  becameAdmin: boolean;
}

/**
 * 创建用户。角色在写入的同一串行区间内判定，
 * 保证并发注册时**只有一个**人能拿到 admin。
 */
export async function createUser(input: RegisterInput): Promise<CreateResult> {
  const username = (input.username ?? '').trim().toLowerCase();
  const nickname = (input.nickname ?? '').trim();
  const password = input.password ?? '';
  const passwordHash = await hashPassword(password);

  return serialize(async () => {
    const store = await read();

    if (store.users.some((u) => u.username === username)) {
      throw new Error('USERNAME_TAKEN');
    }

    const becameAdmin = store.users.length === 0;
    const user: UserRecord = {
      id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      username,
      nickname,
      passwordHash,
      role: becameAdmin ? 'admin' : 'member',
      createdAt: Date.now(),
    };

    store.users.push(user);
    await writeJsonAtomic(FILE, store);

    return { user: toPublic(user), becameAdmin };
  });
}

/** 校验账号口令；成功返回用户，失败返回 null（不区分「无此用户」与「口令错」） */
export async function authenticate(username: string, password: string): Promise<PublicUser | null> {
  const record = await findByUsername(username);
  if (!record) {
    // 仍然算一次哈希，避免用响应时间探测用户是否存在
    await hashPassword(password);
    return null;
  }
  const ok = await verifyPassword(password, record.passwordHash);
  if (!ok) return null;

  await serialize(async () => {
    const store = await read();
    const target = store.users.find((u) => u.id === record.id);
    if (!target) return;
    target.lastLoginAt = Date.now();
    await writeJsonAtomic(FILE, store);
  });

  return toPublic({ ...record, lastLoginAt: Date.now() });
}
