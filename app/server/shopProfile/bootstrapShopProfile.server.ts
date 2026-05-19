import type { AppEntry } from "../../config/appEntry.server";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import {
  buildShopProfileMarkdown,
  buildShopProfilePromptSnippet,
  factsToFacets,
  hashShopBasicFacts,
} from "./buildShopProfileContent.server";
import {
  getShopProfileDoc,
  isShopProfileCosmosConfigured,
  upsertShopProfileDoc,
} from "./cosmosShopProfileStore.server";
import { fetchShopBasicFacts } from "./fetchShopBasicFacts.server";
import {
  isShopProfileBlobConfigured,
  writeShopProfileMarkdown,
} from "./shopProfileBlobStore.server";
import type { ShopProfileDoc } from "./types.server";

const LOG_PREFIX = "[ShopProfile]";

export function isShopProfileEnabled(): boolean {
  const flag = process.env.SHOP_PROFILE_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return isShopProfileCosmosConfigured();
}

/**
 * 拉取 Shopify 基础信息并写入 Cosmos + Blob（安装后或手动刷新）。
 */
export async function bootstrapShopProfile(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
}): Promise<ShopProfileDoc | null> {
  if (!isShopProfileEnabled()) {
    console.info(`${LOG_PREFIX} skipped (disabled or Cosmos not configured)`);
    return null;
  }

  const shop = params.shop.trim();
  if (!shop) return null;

  const facts = await fetchShopBasicFacts(params.admin);
  if (!facts) {
    console.warn(`${LOG_PREFIX} bootstrap failed: empty shop facts shop=${shop}`);
    return null;
  }

  const now = new Date().toISOString();
  const sourceHash = hashShopBasicFacts(facts);
  const existing = await getShopProfileDoc(shop);
  const version = (existing?.version ?? 0) + 1;

  const markdown = buildShopProfileMarkdown(facts, {
    distilledAt: now,
    sourceKind: "shopify_basic_v1",
  });
  const promptSnippet = buildShopProfilePromptSnippet(facts);

  let blobRef: ShopProfileDoc["blob"];
  let profileMarkdownInline: string | undefined;

  if (isShopProfileBlobConfigured()) {
    try {
      blobRef = await writeShopProfileMarkdown(shop, markdown);
    } catch (error) {
      console.error(`${LOG_PREFIX} blob write failed shop=${shop}`, error);
      profileMarkdownInline = markdown;
    }
  } else {
    console.info(`${LOG_PREFIX} blob not configured, inline markdown shop=${shop}`);
    profileMarkdownInline = markdown;
  }

  const doc: ShopProfileDoc = {
    id: "profile",
    docType: "shop_profile",
    shop,
    appName: params.appName,
    version,
    updatedAt: now,
    distilledAt: now,
    sourceKind: "shopify_basic_v1",
    sourceHash,
    promptSnippet,
    facets: factsToFacets(facts),
    ...(blobRef ? { blob: blobRef } : {}),
    ...(profileMarkdownInline ? { profileMarkdownInline } : {}),
    allowTraining: false,
  };

  await upsertShopProfileDoc(doc);
  console.info(
    `${LOG_PREFIX} bootstrap ok shop=${shop} version=${version} blob=${Boolean(blobRef)}`,
  );
  return doc;
}

/**
 * 若尚无画像则创建（用于进入 /app 时兜底）。
 */
export async function ensureShopProfile(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
}): Promise<void> {
  if (!isShopProfileEnabled()) return;
  const shop = params.shop.trim();
  if (!shop) return;
  const existing = await getShopProfileDoc(shop);
  if (existing) return;
  await bootstrapShopProfile(params);
}

/** 安装/OAuth 后异步触发，不阻塞页面 */
export function scheduleShopProfileBootstrap(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
  reason: "install" | "ensure";
}): void {
  if (!isShopProfileEnabled()) return;
  void bootstrapShopProfile(params).catch((error) => {
    console.error(
      `${LOG_PREFIX} async bootstrap failed shop=${params.shop} reason=${params.reason}`,
      error,
    );
  });
}

export function scheduleEnsureShopProfile(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
}): void {
  if (!isShopProfileEnabled()) return;
  void ensureShopProfile(params).catch((error) => {
    console.error(`${LOG_PREFIX} async ensure failed shop=${params.shop}`, error);
  });
}
