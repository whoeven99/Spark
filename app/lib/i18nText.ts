/**
 * 服务端「只出 key」契约的前端渲染入口。
 * Today 诊断快照等落库字段不要改成这个结构；给当次请求的 UI 文案用。
 */
export type I18nText = {
  key: string;
  params?: Record<string, string | number>;
  /** 过渡期兜底。缺 key 时使用；T2+ 接线完成后应删掉。 */
  fallback?: string;
};

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function isI18nText(value: unknown): value is I18nText {
  return Boolean(value) && typeof value === "object" && typeof (value as I18nText).key === "string";
}

export function i18nText(
  key: string,
  params?: Record<string, string | number>,
  fallback?: string,
): I18nText {
  return { key, ...(params ? { params } : {}), ...(fallback ? { fallback } : {}) };
}

/**
 * 把服务端/前端的 I18nText 渲染成当前语言字符串。
 * 未迁移的纯字符串原样返回，方便分批接线。
 */
export function renderI18nText(
  t: TranslateFn,
  node: I18nText | string | null | undefined,
): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  return t(node.key, {
    ...node.params,
    ...(node.fallback ? { defaultValue: node.fallback } : {}),
  });
}
