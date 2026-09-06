/**
 * 多轮对话中的 skillFocus 粘性：点推荐写入，同会话后续发送沿用，
 * 新推荐 key 覆盖；空 explicit 不清除已有 sticky。
 */

export function normalizeSkillFocus(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 本轮实际传给 chat-stream 的 skillFocus：
 * 有显式值（本轮点推荐）用显式；否则用会话粘性。
 */
export function resolveConversationSkillFocus(options: {
  explicit?: string | null;
  sticky?: string | null;
}): string | null {
  return normalizeSkillFocus(options.explicit) ?? normalizeSkillFocus(options.sticky);
}

/**
 * 更新会话粘性：显式 focus 覆盖；未带显式则保持 previous。
 */
export function nextStickySkillFocus(options: {
  explicit?: string | null;
  previous?: string | null;
}): string | null {
  const explicit = normalizeSkillFocus(options.explicit);
  if (explicit) return explicit;
  return normalizeSkillFocus(options.previous);
}
