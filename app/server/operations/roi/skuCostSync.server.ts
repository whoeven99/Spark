import type { Prisma } from "../../../generated/prisma";
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function syncSkuCosts(
  admin: ShopifyAdminGraphqlClient,
  shop: string,
): Promise<{ synced: number }> {
  let after: string | undefined;
  // 唯一键是 shop+inventoryItemId，先按它去重再批量写，避免 createMany 整笔失败。
  const byInventoryItemId = new Map<string, Prisma.ShopSkuCostCreateManyInput>();

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
      byInventoryItemId.set(inventoryItemId, {
        shop,
        inventoryItemId,
        variantId: gidToId(node.id),
        sku: node.sku ?? null,
        unitCost: amount,
        currency: node.inventoryItem?.unitCost?.currencyCode ?? null,
        syncedAt: new Date(),
      });
    }

    if (!variants?.pageInfo?.hasNextPage || !variants.pageInfo.endCursor) break;
    after = variants.pageInfo.endCursor;
  }

  const rows = [...byInventoryItemId.values()];
  if (rows.length === 0) return { synced: 0 };

  // 只重建本次真正拉到的 inventoryItemId：MAX_PAGES 会截断，全量 deleteMany
  // 会把没拉到的 SKU 成本误删。
  const batches = chunk(rows, 200);
  await prisma.$transaction([
    ...batches.map((batch) =>
      prisma.shopSkuCost.deleteMany({
        where: { shop, inventoryItemId: { in: batch.map((row) => row.inventoryItemId) } },
      }),
    ),
    ...batches.map((batch) => prisma.shopSkuCost.createMany({ data: batch })),
  ]);

  return { synced: rows.length };
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

export type SkuCostUpsertInput = {
  /** 接受 gid 或纯数字 id */
  inventoryItemId: string;
  variantId?: string | null;
  sku?: string | null;
  unitCost: number;
};

/**
 * 直接落地一批已知的单位成本，不回源 Shopify。
 *
 * 「成本价导入」写回成功后调用：我们刚把这些成本写进 Shopify，值是权威的，
 * 没必要再拉一遍。不这么做的话，`ensureSkuCostsFresh` 是 24 小时懒同步，
 * 商户导完成本要等到第二天 Today 的利润才会用上真实 COGS。
 */
export async function upsertSkuCosts(
  shop: string,
  entries: SkuCostUpsertInput[],
): Promise<{ written: number }> {
  const byInventoryItemId = new Map<string, Prisma.ShopSkuCostCreateManyInput>();
  for (const entry of entries) {
    const inventoryItemId = gidToId(entry.inventoryItemId);
    if (!inventoryItemId || !Number.isFinite(entry.unitCost) || entry.unitCost < 0) continue;
    byInventoryItemId.set(inventoryItemId, {
      shop,
      inventoryItemId,
      variantId: gidToId(entry.variantId),
      sku: entry.sku ?? null,
      unitCost: entry.unitCost,
      currency: null,
      syncedAt: new Date(),
    });
  }

  const rows = [...byInventoryItemId.values()];
  if (rows.length === 0) return { written: 0 };

  // 币种从表格里读不出来（成本必须是店铺默认货币），沿用已有记录的值而不是抹成 null
  const existing = await prisma.shopSkuCost.findMany({
    where: { shop, inventoryItemId: { in: rows.map((row) => row.inventoryItemId) } },
    select: { inventoryItemId: true, currency: true },
  });
  const currencyByItem = new Map(existing.map((row) => [row.inventoryItemId, row.currency]));
  for (const row of rows) {
    row.currency = currencyByItem.get(row.inventoryItemId) ?? null;
  }

  const batches = chunk(rows, 200);
  await prisma.$transaction([
    ...batches.map((batch) =>
      prisma.shopSkuCost.deleteMany({
        where: { shop, inventoryItemId: { in: batch.map((row) => row.inventoryItemId) } },
      }),
    ),
    ...batches.map((batch) => prisma.shopSkuCost.createMany({ data: batch })),
  ]);

  return { written: rows.length };
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
