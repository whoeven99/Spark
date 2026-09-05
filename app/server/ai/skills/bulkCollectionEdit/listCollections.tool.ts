import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listCollectionSummaries } from "../../../shopify/collectionReader.server";

export const LIST_COLLECTIONS_TOOL_NAME = "list_collections";
const LOG_PREFIX = "[ListCollections]";

/** 单次只读上限：足够让 AI 定位合集，又不会把整店合集塞进上下文。 */
const MAX_COLLECTIONS = 50;

export function createListCollectionsTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_COLLECTIONS_TOOL_NAME,
    description:
      "只读查询店铺的商品合集（Collection），返回名称、商品数，以及它是不是规则驱动的智能合集。用于回答「有哪些合集」「某个合集里有多少商品」，以及在批量调整合集成员前确认目标合集存在且可手动增删。不会修改任何数据。",
    schema: z.object({
      keyword: z.string().optional().describe("合集名称关键词；留空则取最近更新的合集"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_COLLECTIONS)
        .optional()
        .describe(`最多返回多少个合集，默认 20，上限 ${MAX_COLLECTIONS}`),
    }),
    func: async ({ keyword, limit }) => {
      const requestId = crypto.randomUUID();
      try {
        const { collections, hasMore } = await listCollectionSummaries(admin, {
          keyword,
          first: Math.min(limit ?? 20, MAX_COLLECTIONS),
        });

        console.info(
          `${LOG_PREFIX} done requestId=${requestId} collections=${collections.length}`,
        );
        return JSON.stringify({
          ok: true,
          collectionCount: collections.length,
          hasMore,
          collections: collections.map((collection) => ({
            collectionId: collection.collectionId,
            title: collection.title,
            handle: collection.handle,
            productsCount: collection.productsCount,
            // 智能合集的成员由规则决定，不能手动加/移；如实告诉用户，不要承诺能改
            ruleDriven: collection.ruleDriven,
          })),
        });
      } catch (e) {
        console.error(`${LOG_PREFIX} failed requestId=${requestId}`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}
