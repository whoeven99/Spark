/**
 * 粗略估算文本 token 数（中文 ≈ 1 token / 2 字符，英文 ≈ 1 token / 4 字符）。
 * 纯函数，前后端均可使用。
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

export function estimateMessagesTokens(
  messages: { content?: string; text?: string }[],
): number {
  let total = 0;
  for (const m of messages) {
    const text = m.content ?? m.text ?? "";
    total += estimateTokens(text) + 4; // +4 per message overhead (role, separators)
  }
  return total;
}
