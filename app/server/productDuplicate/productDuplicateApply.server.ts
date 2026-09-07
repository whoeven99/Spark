/**
 * 复制商品写回 —— 全仓库唯一调用 productDuplicate 的地方。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { ProductDuplicateApplyOutcome, ProductDuplicateRow } from "../../lib/productDuplicate";
import { mapWithConcurrency } from "../shopify/productIdQuery.server";

const LOG_PREFIX = "[ProductDuplicate][Apply]";
const MUTATION_CONCURRENCY = 2;

const DUPLICATE_MUTATION = `#graphql
  mutation ProductDuplicateRun(
    $productId: ID!
    $newTitle: String!
    $includeImages: Boolean
    $newStatus: ProductStatus
  ) {
    productDuplicate(
      productId: $productId
      newTitle: $newTitle
      includeImages: $includeImages
      newStatus: $newStatus
      synchronous: true
    ) {
      newProduct { id title }
      productDuplicateJob { id done }
      userErrors { field message }
    }
  }
`;

export function buildProductDuplicateWritableRows(rows: ProductDuplicateRow[]): ProductDuplicateRow[] {
  return rows.filter((row) => !row.skipped && row.newTitle.trim() !== "");
}

async function applyRow(
  admin: ShopifyAdminGraphqlClient,
  row: ProductDuplicateRow,
): Promise<{ productId: string; message: string } | null> {
  try {
    const response = await admin.graphql(DUPLICATE_MUTATION, {
      variables: {
        productId: row.productId,
        newTitle: row.newTitle,
        includeImages: row.includeImages,
        newStatus: row.newStatus,
      },
    });
    if (!response.ok) return { productId: row.productId, message: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        productDuplicate?: {
          newProduct?: { id?: string } | null;
          productDuplicateJob?: { done?: boolean } | null;
          userErrors?: Array<{ message: string }> | null;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      return { productId: row.productId, message: json.errors.map((error) => error.message).join("; ") };
    }
    const payload = json.data?.productDuplicate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { productId: row.productId, message: userErrors.map((error) => error.message).join("; ") };
    }
    if (!payload?.newProduct?.id) {
      return {
        productId: row.productId,
        message: "商品过大或需异步复制，请在 Shopify 后台单独复制",
      };
    }
    return null;
  } catch (error) {
    return { productId: row.productId, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function applyProductDuplicate(args: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rows: ProductDuplicateRow[];
}): Promise<ProductDuplicateApplyOutcome> {
  const writableRows = buildProductDuplicateWritableRows(args.rows);
  const outcomes = await mapWithConcurrency(writableRows, MUTATION_CONCURRENCY, (row) =>
    applyRow(args.admin, row),
  );
  const errors = outcomes.filter(
    (item): item is { productId: string; message: string } => item !== null,
  );
  const succeeded = writableRows.length - errors.length;
  console.info(
    `${LOG_PREFIX} shop=${args.shop} products=${writableRows.length} succeeded=${succeeded} failed=${errors.length}`,
  );
  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    errors: errors.slice(0, 50),
  };
}
