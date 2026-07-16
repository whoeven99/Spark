/**
 * 粗略估算文本 token 数（中文 ≈ 1 token / 2 字符，英文 ≈ 1 token / 4 字符）。
 * 与主应用 `app/lib/tokenEstimate.ts` 口径一致。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk / 2 + other / 4);
}
