/**
 * 多轮对话中的 skillFocus：
 * 仅「本轮点推荐」带显式 focus；自由输入不再沿用会话粘性，
 * 避免推荐后的自然语言被收窄工具（与全量 bind 策略冲突）。
 */

export function normalizeSkillFocus(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 本轮实际传给 chat-stream 的 skillFocus：只认本轮显式推荐。
 * `sticky` 参数保留兼容，但不再参与决议。
 */
export function resolveConversationSkillFocus(options: {
  explicit?: string | null;
  /** @deprecated 粘性已停用；保留以免旧调用方报错 */
  sticky?: string | null;
}): string | null {
  void options.sticky;
  return normalizeSkillFocus(options.explicit);
}

/**
 * 会话粘性更新：有显式 focus 则记下（供调试/迁移）；自由输入清空粘性。
 */
export function nextStickySkillFocus(options: {
  explicit?: string | null;
  previous?: string | null;
}): string | null {
  const explicit = normalizeSkillFocus(options.explicit);
  if (explicit) return explicit;
  void options.previous;
  return null;
}
