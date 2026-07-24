/** 从 augment 后的用户消息里取出真实输入（Workspace 会拼上下文 + [用户消息]）。 */
export function extractUserIntentText(lastUserText: string): string {
  const marker = "[用户消息]";
  const idx = lastUserText.lastIndexOf(marker);
  const raw = idx >= 0 ? lastUserText.slice(idx + marker.length) : lastUserText;
  return raw.trim();
}
