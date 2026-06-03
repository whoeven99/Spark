/**
 * 「复制全部」使用的纯文本格式：标题 + 空行 + 描述。
 */
export function buildCopyAllText(
  title: string,
  description: string,
  labels?: {
    title?: string;
    description?: string;
  },
): string {
  const t = title.trim();
  const titleLabel = labels?.title?.trim() || "Product Title";
  const descriptionLabel = labels?.description?.trim() || "Product Description";
  const titleBlock = t ? `${titleLabel}\n${t}` : `${titleLabel}\n`;
  const descBlock = `${descriptionLabel}\n${description}`;
  return `${titleBlock}\n\n${descBlock}`;
}
