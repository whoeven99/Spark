/**
 * 「复制全部」使用的纯文本格式：标题 + 空行 + 描述。
 */
export function buildCopyAllText(title: string, description: string): string {
  const t = title.trim();
  const titleBlock = t ? `Product Title\n${t}` : `Product Title\n`;
  const descBlock = `Product Description\n${description}`;
  return `${titleBlock}\n\n${descBlock}`;
}
