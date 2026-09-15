/**
 * productVariantsBulkUpdate 的唯一 GraphQL 调用处。
 * 调价与改成本各自组 payload，都经这里发出。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const VARIANTS_BULK_UPDATE = `#graphql
  mutation CatalogVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

export async function executeProductVariantsBulkUpdate(
  admin: ShopifyAdminGraphqlClient,
  productId: string,
  variants: Array<Record<string, unknown>>,
): Promise<{ updatedIds: Set<string>; error: string | null }> {
  try {
    const response = await admin.graphql(VARIANTS_BULK_UPDATE, {
      variables: { productId, variants },
    });
    if (!response.ok) return { updatedIds: new Set(), error: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        productVariantsBulkUpdate?: {
          productVariants?: Array<{ id: string }> | null;
          userErrors?: Array<{ message: string }> | null;
        } | null;
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      return { updatedIds: new Set(), error: json.errors.map((error) => error.message).join("; ") };
    }
    const payload = json.data?.productVariantsBulkUpdate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { updatedIds: new Set(), error: userErrors.map((error) => error.message).join("; ") };
    }
    return {
      updatedIds: new Set((payload?.productVariants ?? []).map((item) => item.id)),
      error: null,
    };
  } catch (error) {
    return { updatedIds: new Set(), error: error instanceof Error ? error.message : String(error) };
  }
}
