/**
 * 「复制全部」使用的纯文本格式：与前端按钮文案对应，便于商户粘贴到外部编辑器。
 */
export function buildCopyAllText(title: string, description: string): string {
  const t = title.trim();
  const d = description;
  return `Product Title\n${t}\n\nProduct Description\n${d}`;
}
