/**
 * 「复制全部」使用的纯文本格式：标题 + 空行 + 描述。
 */
export function buildCopyAllText(title: string, description: string): string {
  return `${title}\n\n${description}`;
}
