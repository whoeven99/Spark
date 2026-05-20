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
  readShopProfileMarkdown,
  writeShopProfileMarkdown,
} from "./shopProfileBlobStore.server";
import type { ShopProfileDoc } from "./types.server";

const LOG_PREFIX = "[ShopProfile]";

export function isShopProfileEnabled(): boolean {
  const flag = process.env.SHOP_PROFILE_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return isShopProfileCosmosConfigured() || isShopProfileBlobConfigured();
}

/**
 * 拉取 Shopify 基础信息并写入 Blob（优先）+ Cosmos（可选）。
 */
export async function bootstrapShopProfile(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
}): Promise<ShopProfileDoc | null> {
  if (!isShopProfileEnabled()) {
    console.info(`${LOG_PREFIX} skipped (disabled; need Cosmos and/or Blob)`);
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
  const existing = await getShopProfileDoc(shop).catch(() => null);
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

  const cosmosOk = await upsertShopProfileDoc(doc);

  if (!cosmosOk && !blobRef && !profileMarkdownInline) {
    console.warn(`${LOG_PREFIX} bootstrap failed: no storage backend shop=${shop}`);
    return null;
  }

  console.info(
    `${LOG_PREFIX} bootstrap ok shop=${shop} version=${version} cosmos=${cosmosOk} blob=${Boolean(blobRef)}`,
  );
  return doc;
}

async function shopProfileAlreadyExists(shop: string): Promise<{
  exists: boolean;
  via: "cosmos" | "blob" | null;
}> {
  const existing = await getShopProfileDoc(shop).catch(() => null);
  if (existing) return { exists: true, via: "cosmos" };
  if (isShopProfileBlobConfigured()) {
    const blobMd = await readShopProfileMarkdown(shop);
    if (blobMd?.trim()) return { exists: true, via: "blob" };
  }
  return { exists: false, via: null };
}

/**
 * 若尚无画像则创建（用于进入 /app 时兜底）。
 */
export async function ensureShopProfile(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
}): Promise<void> {
  if (!isShopProfileEnabled()) {
    console.info(`${LOG_PREFIX} ensure skipped (disabled) shop=${params.shop}`);
    return;
  }
  const shop = params.shop.trim();
  if (!shop) return;

  const { exists, via } = await shopProfileAlreadyExists(shop);
  if (exists) {
    console.info(
      `${LOG_PREFIX} ensure skipped (profile already exists via ${via}) shop=${shop}`,
    );
    return;
  }

  console.info(`${LOG_PREFIX} ensure starting bootstrap shop=${shop}`);
  await bootstrapShopProfile(params);
}

/**
 * 安装/OAuth 后刷新画像（会覆盖 Blob/Cosmos，version +1）。
 */
export async function refreshShopProfileOnInstall(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
}): Promise<void> {
  console.info(
    `${LOG_PREFIX} refresh on install shop=${params.shop} appName=${params.appName}`,
  );
  await bootstrapShopProfile(params);
}

/** 安装/OAuth 后异步触发，不阻塞页面 */
export function scheduleShopProfileBootstrap(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: AppEntry | string;
  reason: "install" | "ensure";
}): void {
  if (!isShopProfileEnabled()) {
    console.info(
      `${LOG_PREFIX} schedule bootstrap skipped (disabled) shop=${params.shop}`,
    );
    return;
  }
  console.info(
    `${LOG_PREFIX} schedule bootstrap shop=${params.shop} reason=${params.reason}`,
  );
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
  if (!isShopProfileEnabled()) {
    console.info(
      `${LOG_PREFIX} schedule ensure skipped (disabled) shop=${params.shop}`,
    );
    return;
  }
  console.info(`${LOG_PREFIX} schedule ensure shop=${params.shop}`);
  void ensureShopProfile(params).catch((error) => {
    console.error(`${LOG_PREFIX} async ensure failed shop=${params.shop}`, error);
  });
}
