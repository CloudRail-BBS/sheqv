import { getSettings } from './settings';

/**
 * 可以下发给浏览器的 GeeTest captcha id。
 *
 * `geetestKey` 永远不离开服务端：真正的二次校验在 Rust 侧 `captcha::verify` 做。
 * 后端只在 id + key 都配好时才把 id 放进公开设置，所以这里**只判断 id**。
 *
 * 之前这里还要求 `geetestKey`，但公开投影本来就不含 key，
 * 结果普通访客拿到空 id → 验证组件不渲染，提交时后端却要求验证，
 * 用户只会看到「人机验证未通过，请重新完成验证」。
 */
export async function publicCaptchaId(): Promise<string> {
  const s = await getSettings();
  return (s.geetestId ?? '').trim();
}
