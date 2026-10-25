/**
 * 后台设置的页面分区。
 *
 * 一个 section 对应一个独立地址与侧栏入口；字段仍由同一个 SettingsForm 渲染，
 * 用 data-section 控制当前页显示哪张卡片，避免把表单状态拆成九份。
 */

export type SettingsSection =
  | 'site'
  | 'nav'
  | 'seo'
  | 'storage'
  | 'login'
  | 'moderation'
  | 'integrations'
  | 'content'
  | 'pagehints'
  | 'system';

export interface SettingsSectionDef {
  key: SettingsSection;
  label: string;
  group: string;
  /** 页面标题下的一句话说明 */
  desc: string;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    key: 'site',
    label: '站点与开关',
    group: '基础',
    desc: '站点名、标识、对外地址，以及注册与首页公告开关。',
  },
  { key: 'nav', label: '导航', group: '基础', desc: '侧边栏与移动端底部栏的显示项和顺序。' },
  { key: 'seo', label: 'SEO 与分享', group: '基础', desc: '搜索结果摘要、分享封面与收录开关。' },
  { key: 'storage', label: '对象存储', group: '基础', desc: '媒体文件的存储方式与 S3 兼容存储配置。' },
  {
    key: 'login',
    label: '登录与验证',
    group: '账号与审核',
    desc: '人机验证、邮箱验证码与第三方登录。',
  },
  { key: 'moderation', label: '内容审核', group: '账号与审核', desc: '帖子审核策略与 AI 预审配置。' },
  { key: 'integrations', label: '赞助对接', group: '账号与审核', desc: '爱发电名单同步与公开赞助页。' },
  { key: 'content', label: '文案与页脚', group: '内容', desc: '登录提示、页脚文案、备案号与自定义链接。' },
  { key: 'pagehints', label: '页面提示', group: '内容', desc: '公会、战队、约战、资源等页面标题下的说明文案。' },
  { key: 'system', label: '系统信息', group: '系统', desc: '必须留在环境变量里的进程参数与密钥。' },
];

export const SETTINGS_GROUPS = ['基础', '账号与审核', '内容', '系统'];

export function findSettingsSection(key: string): SettingsSectionDef | undefined {
  return SETTINGS_SECTIONS.find((s) => s.key === key);
}
