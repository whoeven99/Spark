import { createHash } from "node:crypto";
import type {
  ShopBasicFacts,
  ShopProfileFacets,
  ShopProfileSourceKind,
} from "./types.server";

export function hashShopBasicFacts(facts: ShopBasicFacts): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export function factsToFacets(facts: ShopBasicFacts): ShopProfileFacets {
  return {
    shopId: facts.shopId,
    name: facts.name,
    myshopifyDomain: facts.myshopifyDomain,
    primaryDomainHost: facts.primaryDomainHost,
    shopUrl: facts.shopUrl,
    currencyCode: facts.currencyCode,
    ianaTimezone: facts.ianaTimezone,
    planDisplayName: facts.planDisplayName,
    shopifyPlus: facts.shopifyPlus,
    partnerDevelopment: facts.partnerDevelopment,
  };
}

function planLine(facts: ShopBasicFacts): string {
  const bits: string[] = [];
  if (facts.planDisplayName) bits.push(facts.planDisplayName);
  if (facts.shopifyPlus) bits.push("Shopify Plus");
  if (facts.partnerDevelopment) bits.push("合作伙伴开发店");
  return bits.length ? bits.join("，") : "未知";
}

/**
 * 生成写入 Blob 的 profile.md（v1 无 LLM，仅格式化 Shopify 基础事实）。
 */
export function buildShopProfileMarkdown(
  facts: ShopBasicFacts,
  options?: { distilledAt?: string; sourceKind?: ShopProfileSourceKind },
): string {
  const at = options?.distilledAt ?? new Date().toISOString();
  const source = options?.sourceKind ?? "shopify_basic_v1";
  const lines: string[] = [
    "# 商店画像（自动维护）",
    "",
    "> 以下信息来自 Shopify Admin API 店铺基础字段；勿编造未列出内容。",
    "",
    "## 基础",
    `- 店铺名称：${facts.name}`,
    `- myshopify 域名：${facts.myshopifyDomain}`,
  ];

  if (facts.primaryDomainHost) {
    const urlPart = facts.primaryDomainUrl ? `（${facts.primaryDomainUrl}）` : "";
    lines.push(`- 主域名：${facts.primaryDomainHost}${urlPart}`);
  }
  if (facts.shopUrl) lines.push(`- 网店 URL：${facts.shopUrl}`);
  if (facts.currencyCode) lines.push(`- 结算币种：${facts.currencyCode}`);
  if (facts.ianaTimezone) {
    const tzAbbr = facts.timezoneAbbreviation ? `（${facts.timezoneAbbreviation}）` : "";
    lines.push(`- 时区：${facts.ianaTimezone}${tzAbbr}`);
  }
  lines.push(`- 套餐：${planLine(facts)}`);
  lines.push(`- Shop ID：${facts.shopId}`);

  lines.push(
    "",
    "## 元数据",
    `- 数据来源：${source}`,
    `- 更新时间：${at}`,
    "",
    "## 建议关注",
    "- 画像将在后续版本补充经营指标、商品目录与广告数据；当前仅含安装时店铺基础信息。",
  );

  return lines.join("\n");
}

/** 注入 system prompt 的短摘要 */
export function buildShopProfilePromptSnippet(facts: ShopBasicFacts): string {
  const domain = facts.primaryDomainHost ?? facts.myshopifyDomain;
  const plan = planLine(facts);
  const currency = facts.currencyCode ? `，币种 ${facts.currencyCode}` : "";
  const tz = facts.ianaTimezone ? `，时区 ${facts.ianaTimezone}` : "";
  return `店铺「${facts.name}」（${domain}），套餐 ${plan}${currency}${tz}。画像数据截至安装/刷新时 Shopify 基础信息。`;
}
