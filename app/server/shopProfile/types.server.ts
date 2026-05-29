import type { AppEntry } from "../../config/appEntry.server";

/** 当前画像数据来源（后续可扩展 ads_api、website_crawl 等） */
export type ShopProfileSourceKind = "shopify_basic_v1";

export type ShopProfileFacets = {
  shopId?: string;
  name?: string;
  myshopifyDomain?: string;
  primaryDomainHost?: string;
  shopUrl?: string;
  currencyCode?: string;
  ianaTimezone?: string;
  planDisplayName?: string;
  shopifyPlus?: boolean;
  partnerDevelopment?: boolean;
};

/** 从 Shopify 拉取的原始事实（安装时蒸馏输入） */
export type ShopBasicFacts = {
  shopId: string;
  name: string;
  myshopifyDomain: string;
  email?: string;
  contactEmail?: string;
  currencyCode?: string;
  ianaTimezone?: string;
  timezoneAbbreviation?: string;
  shopUrl?: string;
  planDisplayName?: string;
  shopifyPlus?: boolean;
  partnerDevelopment?: boolean;
  primaryDomainHost?: string;
  primaryDomainUrl?: string;
};

/** Cosmos 店铺画像文档（partition: /shop，id 固定 profile；默认与 agent_runs 同容器） */
export type ShopProfileDoc = {
  id: "profile";
  docType: "shop_profile";
  shop: string;
  appName: AppEntry | string;
  version: number;
  updatedAt: string;
  distilledAt: string;
  sourceKind: ShopProfileSourceKind;
  sourceHash: string;
  /** 短摘要，每次对话必带（建议 <800 字符） */
  promptSnippet: string;
  facets: ShopProfileFacets;
  blob?: {
    container: string;
    path: string;
  };
  /** Blob 不可用时内联存储 profile.md */
  profileMarkdownInline?: string;
  allowTraining?: boolean;
};

export type ShopProfileForPrompt = {
  promptSnippet: string;
  shopProfileMarkdown: string;
  facets: ShopProfileFacets;
};
