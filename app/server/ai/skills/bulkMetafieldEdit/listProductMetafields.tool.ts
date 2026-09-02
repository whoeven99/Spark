import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listProductMetafieldDefinitions } from "../../../shopify/productMetafieldReader.server";
import { isSupportedMetafieldType } from "../../../../lib/bulkMetafieldEdit";

export const LIST_PRODUCT_METAFIELDS_TOOL_NAME = "list_product_metafields";
const LOG_PREFIX = "[ListProductMetafields]";

/** 单次只读上限：足够让 AI 定位字段，又不会把整店定义塞进上下文。 */
const MAX_DEFINITIONS = 50;

export function createListProductMetafieldsTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_PRODUCT_METAFIELDS_TOOL_NAME,
    description:
      "只读查询店铺已定义的商品自定义字段（Product metafield definition），返回显示名、namespace.key、数据类型，以及已经有多少商品设过这个字段。用于回答「我有哪些自定义字段」，以及在批量修改前确认目标字段存在、类型是什么。不会修改任何数据。",
    schema: z.object({
      keyword: z
        .string()
        .optional()
        .describe("字段名 / namespace / key 的关键词；留空则返回全部定义"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_DEFINITIONS)
        .optional()
        .describe(`最多返回多少个字段，默认 20，上限 ${MAX_DEFINITIONS}`),
    }),
    func: async ({ keyword, limit }) => {
      const requestId = crypto.randomUUID();
      try {
        const { definitions, hasMore } = await listProductMetafieldDefinitions(admin, {
          keyword,
        });
        const capped = definitions.slice(0, Math.min(limit ?? 20, MAX_DEFINITIONS));

        console.info(
          `${LOG_PREFIX} done requestId=${requestId} definitions=${capped.length}`,
        );
        return JSON.stringify({
          ok: true,
          definitionCount: capped.length,
          hasMore: hasMore || capped.length < definitions.length,
          definitions: capped.map((definition) => ({
            fieldKey: `${definition.namespace}.${definition.key}`,
            name: definition.name,
            type: definition.type,
            description: definition.description,
            usedByProducts: definition.metafieldsCount,
            // 批量修改只支持标量类型；如实告诉模型，免得它承诺改 list / reference 字段
            bulkEditable: isSupportedMetafieldType(definition.type),
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
