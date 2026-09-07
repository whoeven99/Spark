import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BULK_ARCHIVE_MAX_PRODUCTS } from "../../../../lib/bulkArchive";

export const OPEN_BULK_ARCHIVE_FORM_TOOL_NAME = "open_bulk_archive_form";

export type BulkArchiveFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
};

export const bulkArchiveFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_ARCHIVE_FORM_TOOL_NAME,
  description:
    "打开「归档商品」确认卡片。归档不是下架为草稿：归档后商品离开在售目录，恢复不在本能力范围。调用后不会立即归档。",
  schema: z.object({
    products: z
      .array(
        z.object({
          id: z.string(),
          title: z.string().optional(),
          imageUrl: z.string().nullable().optional(),
        }),
      )
      .max(BULK_ARCHIVE_MAX_PRODUCTS)
      .optional(),
  }),
  func: async ({ products }) =>
    JSON.stringify({
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title?.trim() || product.id,
        imageUrl: product.imageUrl ?? null,
      })),
    } satisfies BulkArchiveFormPayload),
});
