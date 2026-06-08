import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext, ToolDefinition } from "../../core/toolRegistry.server";
import { listShopifyArticles } from "../../../shopify/shopifyObjectList.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";

export const LIST_SHOPIFY_ARTICLES_TOOL_NAME = "list_shopify_articles";
const LOG_PREFIX = "[ListShopifyArticles]";

const statusFilterSchema = z.enum(["all", "published", "draft"]);

function createListShopifyArticlesTool(context: AgentContext): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: LIST_SHOPIFY_ARTICLES_TOOL_NAME,
    description:
      "分页浏览店铺博客文章列表，支持按标题关键词、发布状态（published/draft）筛选。无需关键词也可列出最近更新的文章。",
    schema: z.object({
      keyword: z.string().optional().describe("标题关键词，可留空以列出最近更新文章"),
      statusFilter: statusFilterSchema
        .optional()
        .describe("发布状态：all / published / draft，默认 all"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("每页条数，默认 10，最大 20"),
      after: z.string().optional().describe("分页游标，上一页返回的 endCursor"),
    }),
    func: async ({ keyword, statusFilter, limit, after }) => {
      const requestId = crypto.randomUUID();
      console.info(`${LOG_PREFIX} start requestId=${requestId}`);
      try {
        const result = await listShopifyArticles(admin, {
          keyword: keyword ?? "",
          statusFilter: statusFilter ?? "all",
          after: after ?? null,
          first: limit ?? 10,
        });
        console.info(`${LOG_PREFIX} done requestId=${requestId} count=${result.items.length}`);
        return JSON.stringify({
          ok: true,
          count: result.items.length,
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
          articles: result.items.map((item) => ({
            id: item.id,
            title: item.title,
            statusLabel: item.statusLabel,
            subtitle: item.subtitle,
          })),
        });
      } catch (e) {
        logDetailedError(LOG_PREFIX, `requestId=${requestId} failed`, e);
        return JSON.stringify({
          ok: false,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

export const listShopifyArticlesToolDefinition: ToolDefinition = {
  name: "listShopifyArticles",
  displayName: "浏览文章列表",
  category: "商品目录",
  stage: "monitor",
  description: "分页浏览店铺博客文章，支持发布状态筛选",
  systemPromptExtension:
    "当用户想查看博客文章、按草稿/已发布筛选，或需要文章 ID 与标题列表时，调用 list_shopify_articles。需要翻页时传入 after。",
  createTool: (context) => createListShopifyArticlesTool(context),
};
