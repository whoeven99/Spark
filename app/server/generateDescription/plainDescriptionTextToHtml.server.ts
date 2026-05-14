const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 仅用于写入 descriptionHtml 的文本节点转义，避免 XSS。 */
export function escapeHtmlForDescriptionText(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ESCAPE[ch] ?? ch);
}

/**
 * 将模型或用户编辑的纯文本安全转为 `descriptionHtml`：
 * 空行分段为多个 `<p>`，段内换行转为 `<br />`。
 */
export function plainDescriptionTextToDescriptionHtml(plain: string): string {
  const normalized = plain.replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) {
    return "";
  }
  const blocks = trimmed.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const inner = lines.map((line) => escapeHtmlForDescriptionText(line)).join("<br />");
      return `<p>${inner}</p>`;
    })
    .join("");
}
