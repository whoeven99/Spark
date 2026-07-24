import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { coerceBatchTasksFormPayload } from "../../../../lib/batchTasksFormPayload";

export const OPEN_BATCH_TASKS_FORM_TOOL_NAME = "open_batch_tasks_form";

const productSchema = z.object({
  id: z.string().describe("Shopify 商品 GID，例如 gid://shopify/Product/123456"),
  title: z.string().describe("商品标题"),
  imageUrl: z.string().nullable().optional().describe("商品主图 URL（图片翻译时需要）"),
});

/**
 * 当用户想对多个已选商品批量创建任务时调用：
 * 在聊天内展示确认卡片，用户点击确认后批量提交任务。
 */
export const batchTasksFormTool = new DynamicStructuredTool({
  name: OPEN_BATCH_TASKS_FORM_TOOL_NAME,
  description:
    "当用户想要批量处理多个已选商品（优化/生成描述，或翻译商品图片文字）时调用。从上下文提取已选商品列表（ID、标题、图片 URL），在聊天内展示确认卡片，供用户一键提交批量任务。不要在用户仅询问单个商品或未明确批量意图时调用。",
  schema: z.object({
    taskType: z
      .enum(["product_improve", "picture_translate"])
      .describe(
        "任务类型：product_improve = 商品描述优化/生成；picture_translate = 商品图片文字翻译",
      ),
    products: z
      .array(productSchema)
      .min(1)
      .describe("从上下文中提取的已选商品列表，包含 id、title 和 imageUrl（若有）"),
    targetLanguage: z
      .string()
      .optional()
      .describe(
        "目标语言代码，例如 zh-CN、en、ja、ko。product_improve 默认 en，picture_translate 默认 zh",
      ),
    sourceLanguage: z
      .string()
      .optional()
      .describe("源语言代码（仅图片翻译需要），默认 auto 自动识别"),
  }),
  func: async ({ taskType, products, targetLanguage, sourceLanguage }) => {
    const payload = coerceBatchTasksFormPayload({
      taskType,
      products,
      targetLanguage: targetLanguage ?? (taskType === "picture_translate" ? "zh" : "en"),
      sourceLanguage: sourceLanguage ?? "auto",
    });
    return JSON.stringify(payload);
  },
});
