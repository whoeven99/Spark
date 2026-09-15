/**
 * inventorySetQuantities / inventoryAdjustQuantities 的唯一 GraphQL 调用处。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

export type InventoryQuantityName = "available" | "on_hand";

export type InventorySetQuantityInput = {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  compareQuantity: number;
};

export type InventoryAdjustQuantityInput = {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  changeFromQuantity: number;
};

function idempotentKey(): string {
  return crypto.randomUUID();
}

function userErrorMessage(errors: Array<{ message?: string }> | null | undefined): string | null {
  const messages = (errors ?? []).map((error) => error.message?.trim()).filter(Boolean);
  return messages.length > 0 ? messages.join("; ") : null;
}

export async function executeInventorySetQuantities(
  admin: ShopifyAdminGraphqlClient,
  args: {
    name: InventoryQuantityName;
    referenceDocumentUri: string;
    quantities: InventorySetQuantityInput[];
  },
): Promise<{ error: string | null }> {
  const key = idempotentKey();
  const mutation = `#graphql
    mutation InventorySet($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) @idempotent(key: "${key}") {
        userErrors { field message code }
      }
    }
  `;
  try {
    const response = await admin.graphql(mutation, {
      variables: {
        input: {
          name: args.name,
          reason: "correction",
          referenceDocumentUri: args.referenceDocumentUri,
          quantities: args.quantities.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            locationId: item.locationId,
            quantity: item.quantity,
            compareQuantity: item.compareQuantity,
          })),
        },
      },
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        inventorySetQuantities?: { userErrors?: Array<{ message?: string }> | null };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) {
      return { error: json.errors.map((error) => error.message).filter(Boolean).join("; ") };
    }
    return { error: userErrorMessage(json.data?.inventorySetQuantities?.userErrors) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function executeInventoryAdjustQuantities(
  admin: ShopifyAdminGraphqlClient,
  args: {
    name: InventoryQuantityName;
    referenceDocumentUri: string;
    changes: InventoryAdjustQuantityInput[];
  },
): Promise<{ error: string | null }> {
  const key = idempotentKey();
  const mutation = `#graphql
    mutation InventoryAdjust($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: "${key}") {
        userErrors { field message code }
      }
    }
  `;
  try {
    const response = await admin.graphql(mutation, {
      variables: {
        input: {
          name: args.name,
          reason: "correction",
          referenceDocumentUri: args.referenceDocumentUri,
          changes: args.changes.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            locationId: item.locationId,
            delta: item.delta,
            changeFromQuantity: item.changeFromQuantity,
          })),
        },
      },
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const json = (await response.json()) as {
      data?: {
        inventoryAdjustQuantities?: { userErrors?: Array<{ message?: string }> | null };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) {
      return { error: json.errors.map((error) => error.message).filter(Boolean).join("; ") };
    }
    return { error: userErrorMessage(json.data?.inventoryAdjustQuantities?.userErrors) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
