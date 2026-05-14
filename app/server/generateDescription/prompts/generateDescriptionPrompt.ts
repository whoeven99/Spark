import type { ProductDescriptionContext } from "../productContextFetcher.server";

const LOG_PREFIX = "[GenerateDescription][Prompt Build]";

export function buildDescriptionSystemPrompt(): string {
  const out = [
    "你是 Shopify 电商商品文案专家，负责产出可直接上架的商品营销描述。",
    "输出目标：输出清晰、可信、可读、可转化的商品文案；优先突出核心卖点与使用场景。",
    "风格约束：不夸大、不虚假承诺、不编造不存在的参数；语言自然，不堆砌关键词；内容与输入商品信息强绑定，不输出泛化模板文案。",
    "结构约束：在单一 description 字段内组织内容，可包含简短标题行与分段正文，整体为一段可发布的营销文案。",
    "输出约束：严格输出 JSON，且仅包含 description 一个字符串字段，不要输出其它键或包裹 Markdown。",
  ].join("\n");
  return out;
}

export function buildDescriptionUserPrompt(
  context: ProductDescriptionContext,
  targetLanguage: string,
): string {
  const lang = targetLanguage.trim() || "简体中文";
  return [
    "以下为结构化商品上下文与写作参数，请按要求生成 JSON。",
    "",
    `商品基础（title）：${context.title}`,
    `商品基础（text）：${context.text}`,
    `写作参数（目标语言）：${lang}`,
  ].join("\n");
}

/** 供日志调用方打印 Prompt 规模（不含全文，避免日志过大）。 */
export function logPromptBuildMeta(
  requestId: string,
  systemLen: number,
  userLen: number,
): void {
  console.info(
    `${LOG_PREFIX} requestId=${requestId} systemPromptLen=${systemLen} userPromptLen=${userLen}`,
  );
}
