/**
 * 组织标识的默认字符。
 *
 * 公会 / 战队 / 开发团队没有上传 logo 时，用**第一个字**做占位，
 * 而不是把 2–3 个字的简称整个塞进方块里——字号跟着缩小，看上去像贴了张纸条。
 * 拉丁字母统一大写，中文与 emoji 取第一个字素。
 */
export function initialOf(text: string | null | undefined, fallback = '?'): string {
  const s = (text ?? '').trim();
  if (!s) return fallback;

  // 字素切分：避免把 emoji 或组合字符截成半个
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => {
    segment(input: string): Iterable<{ segment: string }>;
  } }).Segmenter;

  let first: string;
  if (Segmenter) {
    const it = new Segmenter('zh', { granularity: 'grapheme' }).segment(s);
    first = (it[Symbol.iterator]().next().value as { segment: string } | undefined)?.segment ?? '';
  } else {
    first = Array.from(s)[0] ?? '';
  }

  if (!first) return fallback;
  return /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
}
