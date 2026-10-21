import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';
import { badgeOf, type BadgeMap } from './badges';

/**
 * 用户存储。
 *
 * - 密码用 scrypt（N=16384, r=8, p=1）加盐哈希，不存明文、不存可逆值；
 * - 第一个注册成功的用户自动成为管理员，**没有内置管理员账号**；
 * - 文件在 $DATA_DIR/users.json，单实例部署够用；换数据库时保持这组函数签名即可。
 */

export type Role = 'admin' | 'member';

/** 第三方登录来源 */
export type Provider = 'github' | 'cnkd';

export interface Identity {
  provider: Provider;
  /** 平台侧唯一 id：GitHub 的 numeric id / CNKD 的 sub */
  sub: string;
  /** 平台用户名，仅用于展示与生成初始昵称 */
  login: string;
  avatar?: string;
}

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
  /** 站内信已读到的时间戳（毫秒）；这之后的评论算未读 */
  notifReadAt?: number;
  /** 封禁：登录被拒、在线会话视为无效 */
  banned?: boolean;
  /** 自定义头衔；空 = 用角色默认文案（管理员显示「管理员」，普通用户不显示） */
  title?: string;
  /** 邮箱（小写）。没有 SMTP，因此只用于登录，不做验证与找回 */
  email?: string;
  /** 第三方身份；同一账号可绑定多个 */
  identities?: Identity[];
  /** 已获得的自定义徽章 id（自动徽章由规则计算，不落库） */
  badges?: string[];
}

/** 对外暴露的用户信息（不含哈希） */
export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  isAdmin: boolean;
  createdAt: number;
  notifReadAt?: number;
  banned?: boolean;
  title?: string;
  email?: string;
  /** 只暴露来源，不暴露第三方 sub */
  providers?: Provider[];
  badges?: string[];
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
    notifReadAt: u.notifReadAt,
    banned: u.banned,
    title: u.title,
    email: u.email,
    providers: u.identities?.map((i) => i.provider),
    badges: u.badges,
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
  /** 可选；填了就能用邮箱登录 */
  email?: string;
}

/** 校验注册入参，返回中文错误；合法返回 null */
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

    const email = normalizeEmail(input.email);
    if (email && store.users.some((u) => u.email === email)) {
      throw new Error('EMAIL_TAKEN');
    }

    const becameAdmin = store.users.length === 0;
    const user: UserRecord = {
      id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      username,
      nickname,
      passwordHash,
      role: becameAdmin ? 'admin' : 'member',
      createdAt: Date.now(),
      ...(email ? { email } : {}),
    };

    store.users.push(user);
    await writeJsonAtomic(FILE, store);

    return { user: toPublic(user), becameAdmin };
  });
}

/** 校验账号口令；成功返回用户，失败返回 null（不区分「无此用户」与「口令错」） */
export async function authenticate(identifier: string, password: string): Promise<PublicUser | null> {
  const text = identifier.trim();
  // 用户名或邮箱都能登录；带 @ 当邮箱处理，否则先用户名再兜底邮箱
  const record = text.includes('@')
    ? await findByEmail(text)
    : ((await findByUsername(text)) ?? (await findByEmail(text)));

  if (!record) {
    // 仍然算一次哈希，避免用响应时间探测用户是否存在
    await hashPassword(password);
    return null;
  }

  // 纯第三方账号没有设置密码，禁止密码登录
  if (!record.passwordHash) return null;

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

/** 把站内信标记为已读（只往后推进，不回退） */
export async function markNotificationsRead(userId: string, at = Date.now()): Promise<number> {
  let next = at;
  await serialize(async () => {
    const store = await read();
    const target = store.users.find((u) => u.id === userId);
    if (!target) return;
    const prev = target.notifReadAt ?? 0;
    next = Math.max(prev, at);
    target.notifReadAt = next;
    await writeJsonAtomic(FILE, store);
  });
  return next;
}

/**
 * 改角色 / 封禁 / 头衔。返回更新后的用户，找不到返回 null。
 * `title: null` 表示清除头衔（回落角色默认文案）。
 */
export async function updateUser(
  id: string,
  patch: { role?: Role; banned?: boolean; title?: string | null },
): Promise<PublicUser | null> {
  let out: PublicUser | null = null;
  await serialize(async () => {
    const store = await read();
    const target = store.users.find((u) => u.id === id);
    if (!target) return;
    if (patch.role) target.role = patch.role;
    if (typeof patch.banned === 'boolean') target.banned = patch.banned;
    if (patch.title !== undefined) {
      const next = (patch.title ?? '').trim();
      if (next) target.title = next;
      else delete target.title;
    }
    await writeJsonAtomic(FILE, store);
    out = toPublic(target);
  });
  return out;
}

/**
 * 一次性取出所有用户的徽标，供列表页批量渲染。
 * 同时用 id 和昵称做键：帖子现在会存 authorId，早期帖子只有昵称。
 */
export async function getBadgeMap(): Promise<BadgeMap> {
  const users = (await read()).users;
  const map: BadgeMap = {};
  for (const u of users) {
    const info = badgeOf(u);
    if (!info) continue;
    map[`id:${u.id}`] = info;
    map[`name:${u.nickname}`] = info;
  }
  return map;
}

/** 删除用户（后台用；调用方需自己保证不会删掉最后一个管理员） */
export async function removeUser(id: string): Promise<boolean> {
  let found = false;
  await serialize(async () => {
    const store = await read();
    const next = store.users.filter((u) => u.id !== id);
    if (next.length === store.users.length) return;
    found = true;
    store.users = next;
    await writeJsonAtomic(FILE, store);
  });
  return found;
}

export async function countAdmins(): Promise<number> {
  return (await read()).users.filter((u) => u.role === 'admin' && !u.banned).length;
}


/* ── 邮箱与第三方身份 ───────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function normalizeEmail(v?: string | null): string {
  const t = (v ?? '').trim().toLowerCase();
  return t && isEmail(t) ? t : '';
}

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const target = normalizeEmail(email);
  if (!target) return null;
  return (await read()).users.find((u) => u.email === target) ?? null;
}

export async function findByIdentity(provider: Provider, sub: string): Promise<UserRecord | null> {
  return (
    (await read()).users.find((u) => (u.identities ?? []).some((i) => i.provider === provider && i.sub === sub)) ??
    null
  );
}

/** 把第三方身份挂到已有账号上（同 provider 已绑定同一 sub 时幂等） */
export async function linkIdentity(userId: string, identity: Identity): Promise<PublicUser | null> {
  let out: PublicUser | null = null;
  await serialize(async () => {
    const store = await read();
    const target = store.users.find((u) => u.id === userId);
    if (!target) return;
    const list = target.identities ?? [];
    if (!list.some((i) => i.provider === identity.provider && i.sub === identity.sub)) {
      target.identities = [...list, identity];
      await writeJsonAtomic(FILE, store);
    }
    out = toPublic(target);
  });
  return out;
}

/** 用户名只能用小写字母数字和 _-；第三方昵称可能带空格与中文，需要兜底 */
function usernameFrom(login: string): string {
  const base = login
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 16);
  return base.length >= 3 ? base : `user${Math.random().toString(36).slice(2, 8)}`;
}

export interface SocialProfile {
  provider: Provider;
  sub: string;
  login: string;
  displayName?: string;
  avatar?: string;
}

/**
 * 第三方登录建号：
 *  - 已绑定 → 直接返回；
 *  - 未绑定 → 新建账号（没有密码，只能走第三方登录），用户名自动去重。
 */
export async function upsertSocialUser(
  profile: SocialProfile,
): Promise<{ user: PublicUser; created: boolean } | null> {
  const existing = await findByIdentity(profile.provider, profile.sub);
  if (existing) return { user: toPublic(existing), created: false };

  return serialize(async () => {
    const store = await read();

    // 并发下可能刚被另一个回调建好，再查一次
    const again = store.users.find((u) =>
      (u.identities ?? []).some((i) => i.provider === profile.provider && i.sub === profile.sub),
    );
    if (again) return { user: toPublic(again), created: false };

    const wanted = usernameFrom(profile.login);
    let username = wanted;
    let n = 2;
    while (store.users.some((u) => u.username === username)) {
      username = `${wanted}${n}`.slice(0, 20);
      n += 1;
    }

    const nicknameBase = (profile.displayName || profile.login || '玩家').trim().slice(0, 16);
    const user: UserRecord = {
      id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      username,
      nickname: nicknameBase.length >= 2 ? nicknameBase : `${nicknameBase}玩家`,
      // 没有密码：passwordHash 为空串，authenticate 会拒绝密码登录
      passwordHash: '',
      role: store.users.length === 0 ? 'admin' : 'member',
      createdAt: Date.now(),
      identities: [
        {
          provider: profile.provider,
          sub: profile.sub,
          login: profile.login,
          ...(profile.avatar ? { avatar: profile.avatar } : {}),
        },
      ],
    };

    store.users.push(user);
    await writeJsonAtomic(FILE, store);
    return { user: toPublic(user), created: true };
  });
}

/** 后台/站内分配徽章（自动徽章不落库，这里只存额外徽章 id） */
export async function setUserBadges(userId: string, badges: string[]): Promise<PublicUser | null> {
  let out: PublicUser | null = null;
  await serialize(async () => {
    const store = await read();
    const target = store.users.find((u) => u.id === userId);
    if (!target) return;
    const clean = Array.from(new Set(badges.map((b) => b.trim()).filter(Boolean))).slice(0, 12);
    if (clean.length) target.badges = clean;
    else delete target.badges;
    await writeJsonAtomic(FILE, store);
    out = toPublic(target);
  });
  return out;
}
