/**
 * 复制商品写回 —— 全仓库唯一调用 productDuplicate 的地方。
 * 2026-07 payload 是 newProduct / imageJob / productDuplicateOperation，不要再查 productDuplicateJob。
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
      imageJob { id done }
      productDuplicateOperation { id status }
      userErrors { field message }
    }
  }
`;

type DuplicatePayload = {
  newProduct?: { id?: string } | null;
  imageJob?: { id?: string; done?: boolean } | null;
  productDuplicateOperation?: { id?: string; status?: string } | null;
  userErrors?: Array<{ message: string }> | null;
};

export function buildProductDuplicateWritableRows(rows: ProductDuplicateRow[]): ProductDuplicateRow[] {
  return rows.filter((row) => !row.skipped && row.newTitle.trim() !== "");
}

export function duplicateApplyFailureMessage(json: {
  data?: { productDuplicate?: DuplicatePayload | null };
  errors?: Array<{ message: string }>;
}): string | null {
  if (json.errors?.length) return json.errors.map((error) => error.message).join("; ");
  const payload = json.data?.productDuplicate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) return userErrors.map((error) => error.message).join("; ");
  if (payload?.newProduct?.id) return null;
  const status = payload?.productDuplicateOperation?.status?.trim();
  if (status) return `复制未完成（${status}），请在 Shopify 后台查看是否已生成草稿`;
  return "复制未返回新商品，请稍后在 Shopify 后台确认";
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
      data?: { productDuplicate?: DuplicatePayload | null };
      errors?: Array<{ message: string }>;
    };
    const message = duplicateApplyFailureMessage(json);
    return message ? { productId: row.productId, message } : null;
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
  if (errors.length > 0) {
    console.error(`${LOG_PREFIX} shop=${args.shop} errors=${JSON.stringify(errors.slice(0, 10))}`);
  }
  return {
    at: new Date().toISOString(),
    succeeded,
    failed: errors.length,
    errors: errors.slice(0, 50),
  };
}
