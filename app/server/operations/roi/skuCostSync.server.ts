import prisma from "../../../db.server";
import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";

/**
 * SKU 单位成本同步：拉取 Shopify inventoryItem.unitCost 作为逐 SKU COGS。
 * 需要 read_inventory scope；拉取失败时静默降级（ROI 层会回退到默认毛利率口径）。
 */

const VARIANT_UNIT_COSTS_QUERY = `#graphql
  query VariantUnitCosts($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sku
        inventoryItem {
          id
          unitCost {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

const MAX_PAGES = 8;
const PAGE_SIZE = 250;
const STALE_HOURS = 24;

function gidToId(gid: string | undefined | null): string | null {
  if (!gid) return null;
  const idx = gid.lastIndexOf("/");
  return idx >= 0 ? gid.slice(idx + 1) : gid;
}

export async function syncSkuCosts(
  admin: ShopifyAdminGraphqlClient,
  shop: string,
): Promise<{ synced: number }> {
  let after: string | undefined;
  let synced = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await admin.graphql(VARIANT_UNIT_COSTS_QUERY, {
      variables: { first: PAGE_SIZE, after },
    });
    const payload = (await response.json()) as {
      data?: {
        productVariants?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{
            id?: string;
            sku?: string | null;
            inventoryItem?: {
              id?: string;
              unitCost?: { amount?: string; currencyCode?: string } | null;
            } | null;
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) throw new Error(gqlErrors.join("；"));

    const variants = payload.data?.productVariants;
    for (const node of variants?.nodes ?? []) {
      const inventoryItemId = gidToId(node.inventoryItem?.id);
      const amount = Number(node.inventoryItem?.unitCost?.amount);
      if (!inventoryItemId || !Number.isFinite(amount) || amount <= 0) continue;
      await prisma.shopSkuCost.upsert({
        where: { shop_inventoryItemId: { shop, inventoryItemId } },
        update: {
          unitCost: amount,
          currency: node.inventoryItem?.unitCost?.currencyCode ?? null,
          sku: node.sku ?? null,
          variantId: gidToId(node.id),
          syncedAt: new Date(),
        },
        create: {
          shop,
          inventoryItemId,
          variantId: gidToId(node.id),
          sku: node.sku ?? null,
          unitCost: amount,
          currency: node.inventoryItem?.unitCost?.currencyCode ?? null,
        },
      });
      synced += 1;
    }

    if (!variants?.pageInfo?.hasNextPage || !variants.pageInfo.endCursor) break;
    after = variants.pageInfo.endCursor;
  }

  return { synced };
}

/** 进程内同步尝试时间（店铺无 unitCost 数据时避免每次请求都重拉） */
const lastAttemptAt = new Map<string, number>();

/** 懒同步：24 小时内同步过（或尝试过）则跳过；失败只告警不抛出。 */
export async function ensureSkuCostsFresh(
  admin: ShopifyAdminGraphqlClient,
  shop: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const staleMs = STALE_HOURS * 60 * 60 * 1000;
    const attempted = lastAttemptAt.get(shop);
    if (attempted && now.getTime() - attempted < staleMs) return;
    const latest = await prisma.shopSkuCost.findFirst({
      where: { shop },
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    });
    if (latest && now.getTime() - latest.syncedAt.getTime() < staleMs) {
      return;
    }
    lastAttemptAt.set(shop, now.getTime());
    const { synced } = await syncSkuCosts(admin, shop);
    console.info(`[skuCostSync] shop=${shop} synced=${synced}`);
  } catch (error) {
    console.warn(`[skuCostSync] shop=${shop} failed (degrade to margin):`, error);
  }
}

/** 读取 SKU 成本映射：inventoryItemId / sku → unitCost。 */
export async function loadSkuCostMap(shop: string): Promise<Map<string, number>> {
  const rows = await prisma.shopSkuCost.findMany({ where: { shop } });
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.inventoryItemId, row.unitCost);
    if (row.sku) map.set(`sku:${row.sku}`, row.unitCost);
    if (row.variantId) map.set(`variant:${row.variantId}`, row.unitCost);
  }
  return map;
}
