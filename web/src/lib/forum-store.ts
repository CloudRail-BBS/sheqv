import { FEED, type FeedItem } from './data';
import { dataFile, readJson, serialize, writeJsonAtomic } from './json-store';

/**
 * 论坛存储：内置种子（FEED）+ 用户新发帖 / 评论 / 点赞
 * 落 $DATA_DIR/forum.json（默认 .data），够演示；生产换 DB 时保持这组函数签名即可。
 */

const FILE = dataFile('forum.json');

export interface CommentItem {
  id: string;
  author: string;
  /** 作者账号 id，用于精确匹配头衔；早期评论没有这个字段 */
  authorId?: string;
  body: string;
  at: number;
}

interface StoredPost {
  id: string;
  author: string;
  /** 作者账号 id，用于精确匹配头衔；早期帖子没有这个字段 */
  authorId?: string;
  guild: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  likes: number;
}

interface Store {
  posts: StoredPost[];
  comments: Record<string, CommentItem[]>;
  likes: Record<string, number>;
}

async function read(): Promise<Store> {
  const parsed = await readJson<Partial<Store>>(FILE, {});
  return {
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    comments: parsed.comments && typeof parsed.comments === 'object' ? parsed.comments : {},
    likes: parsed.likes && typeof parsed.likes === 'object' ? parsed.likes : {},
  };
}

/** 读-改-写统一在串行区间内，避免并发点两次赞只 +1 */
async function mutate<T>(fn: (store: Store) => T): Promise<T> {
  return serialize(async () => {
    const store = await read();
    const result = fn(store);
    await writeJsonAtomic(FILE, store);
    return result;
  });
}

export interface PostView extends FeedItem {
  commentsList: CommentItem[];
  createdAt?: number;
  isNew?: boolean;
  href: string;
}

const relTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
};

export async function listPosts(): Promise<PostView[]> {
  const store = await read();

  const seeds: PostView[] = FEED.map((f) => {
    const extraLikes = store.likes[f.id] ?? 0;
    const list = store.comments[f.id] ?? [];
    return {
      ...f,
      likes: f.likes + extraLikes,
      comments: f.comments + list.length,
      commentsList: list,
      href: `/p/${f.id}`,
    };
  });

  const created: PostView[] = store.posts
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => {
      const list = store.comments[p.id] ?? [];
      return {
        id: p.id,
        author: p.author,
        authorId: p.authorId,
        guild: p.guild,
        time: relTime(p.createdAt),
        title: p.title,
        body: p.body,
        tags: p.tags,
        likes: p.likes + (store.likes[p.id] ?? 0),
        comments: list.length,
        commentsList: list,
        createdAt: p.createdAt,
        isNew: true,
        href: `/p/${p.id}`,
      };
    });

  const pinned = seeds.filter((s) => s.pinned);
  const rest = seeds.filter((s) => !s.pinned);
  return [...pinned, ...created, ...rest];
}

export async function getPost(id: string): Promise<PostView | null> {
  return (await listPosts()).find((p) => p.id === id) ?? null;
}

export interface NewPostInput {
  title?: string;
  body?: string;
  tags?: string[];
  /** 作者，取自当前登录账号；不传则视为匿名（接口层已拦截未登录） */
  author?: string;
  /** 作者账号 id，接口层同样取自会话 */
  authorId?: string;
  guild?: string;
}

/** 入参来自 JSON，可能是任意类型；统一收敛成字符串再校验 */
const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

export function validatePost(input: NewPostInput): string | null {
  const title = asText(input?.title).trim();
  const body = asText(input?.body).trim();
  if (title.length < 4 || title.length > 60) return '标题需 4–60 字';
  if (body.length < 10) return '正文至少 10 字';
  if (body.length > 8000) return '正文不超过 8000 字';
  return null;
}

export async function addPost(input: NewPostInput): Promise<PostView> {
  const now = Date.now();
  const post: StoredPost = {
    id: `p${now.toString(36)}`,
    author: (input.author ?? '').trim() || '匿名',
    authorId: input.authorId || undefined,
    guild: (input.guild ?? '').trim() || '个人',
    title: asText(input.title).trim(),
    body: asText(input.body).trim(),
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => asText(t).trim()).filter(Boolean).slice(0, 3)
      : [],
    createdAt: now,
    likes: 0,
  };
  await mutate((store) => {
    store.posts.push(post);
  });
  return (await getPost(post.id))!;
}

export async function addComment(
  postId: string,
  body: string,
  author?: string,
  authorId?: string,
): Promise<CommentItem | null> {
  const post = await getPost(postId);
  if (!post) return null;

  const comment: CommentItem = {
    id: `c${Date.now().toString(36)}`,
    author: (author ?? '').trim() || '匿名',
    authorId: authorId || undefined,
    body: body.trim(),
    at: Date.now(),
  };
  await mutate((store) => {
    store.comments[postId] = [...(store.comments[postId] ?? []), comment];
  });
  return comment;
}

export async function likePost(postId: string): Promise<number | null> {
  const post = await getPost(postId);
  if (!post) return null;
  return mutate((store) => {
    store.likes[postId] = (store.likes[postId] ?? 0) + 1;
    return post.likes + 1;
  });
}

/** 通知：我的帖子下的新评论 + 待我确认的比赛 */
export interface NotificationItem {
  id: string;
  kind: 'comment';
  author: string;
  text: string;
  at: number;
  href: string;
}

/**
 * 评论通知：别人在我的帖子下的评论。
 * 用一次读盘建 postId→title 的索引，避免逐条 getPost 造成 O(n) 次文件读。
 */
export async function listNotifications(excludeAuthor?: string): Promise<NotificationItem[]> {
  const store = await read();
  const titleOf = new Map(store.posts.map((p) => [p.id, p.title]));
  const items: NotificationItem[] = [];

  for (const [postId, list] of Object.entries(store.comments)) {
    for (const c of list) {
      if (excludeAuthor && c.author === excludeAuthor) continue;
      items.push({
        id: c.id,
        kind: 'comment',
        author: c.author,
        text: `${c.author} 评论了《${titleOf.get(postId) ?? '你的帖子'}》：${c.body.slice(0, 40)}`,
        at: c.at,
        href: `/p/${postId}`,
      });
    }
  }

  return items.sort((a, b) => b.at - a.at);
}

/** 后台概览用的计数 */
export async function forumStats(): Promise<{ posts: number; comments: number; likes: number }> {
  const store = await read();
  return {
    posts: store.posts.length,
    comments: Object.values(store.comments).reduce((n, list) => n + list.length, 0),
    likes: Object.values(store.likes).reduce((n, v) => n + v, 0),
  };
}

/** 后台删除帖子：连同评论与点赞一起清掉，避免留下孤儿数据 */
export async function deletePost(id: string): Promise<boolean> {
  return serialize(async () => {
    const store = await read();
    const before = store.posts.length;
    store.posts = store.posts.filter((p) => p.id !== id);
    if (store.posts.length === before) return false;

    delete store.comments[id];
    delete store.likes[id];
    await writeJsonAtomic(FILE, store);
    return true;
  });
}
