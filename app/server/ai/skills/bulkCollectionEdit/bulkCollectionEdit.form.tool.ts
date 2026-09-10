import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { BULK_COLLECTION_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkCollectionEdit";
import { listManualCollections } from "../../../shopify/collectionMembershipReader.server";

export const OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME = "open_bulk_collection_edit_form";

export type BulkCollectionEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  collectionAction?: string;
  collectionId?: string;
  collections?: Array<{ value: string; label: string }>;
};

export function createBulkCollectionEditFormTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME,
    description:
      "打开「批量调整商品所属合集」确认卡片。只支持手动合集；智能合集不能加减成员。方向和目标合集在卡片里选，不必先知道合集 GID。调用后不会修改任何商品。",
    schema: z.object({
      products: z
        .array(
          z.object({
            id: z.string(),
            title: z.string().optional(),
            imageUrl: z.string().nullable().optional(),
          }),
        )
        .max(BULK_COLLECTION_EDIT_MAX_PRODUCTS)
        .optional(),
      collectionAction: z.enum(["add", "remove"]).optional(),
      collectionId: z.string().optional().describe("合集 GID，如 gid://shopify/Collection/123"),
    }),
    func: async ({ products, collectionAction, collectionId }) => {
      let collections: Array<{ value: string; label: string }> = [];
      try {
        collections = await listManualCollections(admin);
      } catch (error) {
        console.error("[BulkCollectionEdit][Form] list collections failed", error);
      }
      const payload: BulkCollectionEditFormPayload = {
        products: (products ?? []).map((product: { id: string; title?: string; imageUrl?: string | null }) => ({
          id: product.id,
          title: product.title?.trim() || product.id,
          imageUrl: product.imageUrl ?? null,
        })),
        collections,
        ...(collectionAction ? { collectionAction } : {}),
        ...(collectionId?.trim() ? { collectionId: collectionId.trim() } : {}),
      };
      return JSON.stringify(payload);
    },
  });
}
