import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listCollectionSummaries } from "../../../shopify/collectionReader.server";
import { BULK_COLLECTION_EDIT_MAX_PRODUCTS } from "../../../../lib/bulkCollectionEdit";

export const OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME = "open_bulk_collection_edit_form";

/** 下拉里最多放多少个合集：够覆盖绝大多数店铺，又不至于让卡片 payload 无节制膨胀。 */
const MAX_COLLECTION_OPTIONS = 100;

export type BulkCollectionEditFormPayload = {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  action?: string;
  collectionId?: string;
  collectionOptions: Array<{ value: string; label: string }>;
  collectionsTruncated?: boolean;
};

/** zod 在 `.max().optional()` 之后推不出元素类型，这里显式给一份与 schema 同形的类型。 */
type ToolProductArg = { id: string; title?: string; imageUrl?: string | null };

function optionLabel(title: string, productsCount: number | null): string {
  return productsCount == null ? title : `${title} · ${productsCount} 件`;
}

/**
 * 打开批量入 / 出 Collection 确认卡。
 *
 * 与其它批量能力的开卡工具不同，这里必须读一次 Shopify：确认卡的合集下拉需要真实选项，
 * 而卡片渲染发生在 SSE 同步回调里、没法再发异步请求。读的是只读列表，不做任何写入。
 * 智能合集不进下拉——选了也写不进去，不如从一开始就不给。
 */
export function createBulkCollectionEditFormTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME,
    description:
      "打开「批量调整商品所属合集」确认卡片。当用户要把一批商品加入某个合集或从某个合集移出时调用，例如「把这些商品加到夏季清仓」「把断货的从首页推荐里撤下来」。调用后不会修改任何商品。",
    schema: z.object({
      products: z
        .array(
          z.object({
            id: z.string().describe("商品 GID，如 gid://shopify/Product/123"),
            title: z.string().optional(),
            imageUrl: z.string().nullable().optional(),
          }),
        )
        .max(BULK_COLLECTION_EDIT_MAX_PRODUCTS)
        .optional()
        .describe(
          "要调整合集归属的商品；从[工作台上下文]的已选商品逐行提取，留空则由前端用已选商品补全",
        ),
      action: z
        .enum(["add", "remove"])
        .optional()
        .describe(
          "操作方向：加入合集填 add，移出合集填 remove。用户没说清方向就不要传，让他在卡片里选",
        ),
      collectionKeyword: z
        .string()
        .optional()
        .describe("用户提到的合集名称关键词，用于把下拉候选缩小到相关合集；没提就不要传"),
      collectionId: z
        .string()
        .optional()
        .describe("已经确定的合集 GID（如先调用过 list_collections）；不确定就不要传"),
    }),
    func: async ({ products, action, collectionKeyword, collectionId }) => {
      const keyword = collectionKeyword?.trim() ?? "";
      let listed = await listCollectionSummaries(admin, {
        keyword,
        first: MAX_COLLECTION_OPTIONS,
      });
      let usable = listed.collections.filter((collection) => !collection.ruleDriven);

      // 关键词没匹配到任何可手动增删的合集时退回最近更新列表，避免下拉空着
      if (keyword && usable.length === 0) {
        listed = await listCollectionSummaries(admin, { first: MAX_COLLECTION_OPTIONS });
        usable = listed.collections.filter((collection) => !collection.ruleDriven);
      }

      const collectionOptions = usable.map((collection) => ({
        value: collection.collectionId,
        label: optionLabel(collection.title, collection.productsCount),
      }));

      const requestedId = collectionId?.trim() ?? "";
      const preselected =
        requestedId && collectionOptions.some((option) => option.value === requestedId)
          ? requestedId
          : // 关键词只命中唯一一个可用合集时替用户选好，其余情况留空让他自己确认
            usable.length === 1
            ? usable[0].collectionId
            : "";

      const payload: BulkCollectionEditFormPayload = {
        products: ((products ?? []) as ToolProductArg[]).map((p) => ({
          id: p.id,
          title: p.title?.trim() || p.id,
          imageUrl: p.imageUrl ?? null,
        })),
        ...(action ? { action } : {}),
        ...(preselected ? { collectionId: preselected } : {}),
        collectionOptions,
        ...(listed.hasMore ? { collectionsTruncated: true } : {}),
      };
      return JSON.stringify({
        ...payload,
        // 给模型的额外说明，不进卡片：被排除的智能合集数量
        excludedRuleDrivenCount: listed.collections.length - usable.length,
      });
    },
  });
}
