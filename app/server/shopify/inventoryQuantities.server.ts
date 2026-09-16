/**
 * inventorySetQuantities / inventoryAdjustQuantities 的唯一调用处。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { mapWithConcurrency } from "./productIdQuery.server";

function setMutation(idem: string): string {
  return `#graphql
  mutation SparkInventorySet($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) @idempotent(key: "${idem}") {
      inventoryAdjustmentGroup { id }
      userErrors { field message code }
    }
  }
`;
}

function adjustMutation(idem: string): string {
  return `#graphql
  mutation SparkInventoryAdjust($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) @idempotent(key: "${idem}") {
      inventoryAdjustmentGroup { id }
      userErrors { field message }
    }
  }
`;
}

export type InventoryQuantityName = "available" | "on_hand";

export type InventorySetItem = {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  compareQuantity: number;
};

export type InventoryAdjustItem = {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  compareQuantity: number;
};

export type InventoryMutationError = {
  inventoryItemId: string;
  locationId: string;
  message: string;
};

const CONCURRENCY = 2;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function runGraphql(
  admin: ShopifyAdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const response = await admin.graphql(query, { variables });
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const json = (await response.json()) as {
    data?: Record<string, { userErrors?: Array<{ message?: string }> | null } | null>;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) return { error: json.errors.map((item) => item.message).join("; ") };
  const payload = Object.values(json.data ?? {})[0];
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { error: userErrors.map((item) => item.message ?? "user error").join("; ") };
  }
  return { error: null };
}

export async function setInventoryQuantities(args: {
  admin: ShopifyAdminGraphqlClient;
  name: InventoryQuantityName;
  referenceDocumentUri: string;
  items: InventorySetItem[];
  batchSize: number;
}): Promise<{ succeeded: number; errors: InventoryMutationError[] }> {
  const batches = chunk(args.items, args.batchSize);
  const outcomes = await mapWithConcurrency(batches, CONCURRENCY, async (batch) => {
    const idem = crypto.randomUUID();
    const result = await runGraphql(args.admin, setMutation(idem), {
      input: {
        name: args.name,
        reason: "correction",
        referenceDocumentUri: args.referenceDocumentUri,
        quantities: batch.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          locationId: item.locationId,
          quantity: item.quantity,
          compareQuantity: item.compareQuantity,
        })),
      },
    });
    if (!result.error) return { succeeded: batch.length, errors: [] as InventoryMutationError[] };
    return {
      succeeded: 0,
      errors: batch.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        locationId: item.locationId,
        message: result.error as string,
      })),
    };
  });
  return mergeOutcomes(outcomes);
}

export async function adjustInventoryQuantities(args: {
  admin: ShopifyAdminGraphqlClient;
  referenceDocumentUri: string;
  items: InventoryAdjustItem[];
  batchSize: number;
}): Promise<{ succeeded: number; errors: InventoryMutationError[] }> {
  const batches = chunk(args.items, args.batchSize);
  const outcomes = await mapWithConcurrency(batches, CONCURRENCY, async (batch) => {
    const idem = crypto.randomUUID();
    const result = await runGraphql(args.admin, adjustMutation(idem), {
      input: {
        name: "available",
        reason: "correction",
        referenceDocumentUri: args.referenceDocumentUri,
        changes: batch.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          locationId: item.locationId,
          delta: item.delta,
          changeFromQuantity: item.compareQuantity,
        })),
      },
    });
    if (!result.error) return { succeeded: batch.length, errors: [] as InventoryMutationError[] };
    return {
      succeeded: 0,
      errors: batch.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        locationId: item.locationId,
        message: result.error as string,
      })),
    };
  });
  return mergeOutcomes(outcomes);
}

function mergeOutcomes(
  outcomes: Array<{ succeeded: number; errors: InventoryMutationError[] }>,
): { succeeded: number; errors: InventoryMutationError[] } {
  let succeeded = 0;
  const errors: InventoryMutationError[] = [];
  for (const outcome of outcomes) {
    succeeded += outcome.succeeded;
    errors.push(...outcome.errors);
  }
  return { succeeded, errors: errors.slice(0, 50) };
}
