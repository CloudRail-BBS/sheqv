/** 首页信息流的标签。放普通模块里：客户端组件和服务端页面都能用。 */
export type FeedTab = 'recommend' | 'new' | 'featured' | 'following' | 'joined';

export const FEED_TABS: { key: FeedTab; label: string; hint: string }[] = [
  { key: 'recommend', label: '推荐', hint: '按热度排序' },
  { key: 'new', label: '最新', hint: '按发布时间' },
  { key: 'featured', label: '精华', hint: '管理员挑过的帖子' },
  { key: 'following', label: '关注', hint: '只看关注的人' },
  { key: 'joined', label: '我参与的', hint: '赞过或回复过' },
];

export function isFeedTab(v: string | undefined): v is FeedTab {
  return Boolean(v && FEED_TABS.some((t) => t.key === v));
}
