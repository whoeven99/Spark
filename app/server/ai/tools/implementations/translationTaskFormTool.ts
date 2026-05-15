import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createTranslationJob } from "../../translation/translationPipelineCore.server";
import {
  ALLOWED_TRANSLATABLE_RESOURCE_TYPES,
  TRANSLATABLE_RESOURCE_TYPE_SCHEMA,
} from "../../../server/translation/types";

export const translationTaskFormTool = new DynamicStructuredTool({
  name: "create_translation_task",
  description: "Creates a new translation task with specified source, target languages, and resource types.",
  schema: z.object({
    sourceLocale: z.string().describe("The source language locale (e.g., 'en-US', 'zh-CN')."),
    targetLocale: z.string().describe("The target language locale (e.g., 'en-US', 'zh-CN')."),
    resourceTypes: z.array(TRANSLATABLE_RESOURCE_TYPE_SCHEMA).optional().default(["PRODUCT"])
      .describe("An array of resource types to translate (e.g., 'PRODUCT', 'COLLECTION', 'PAGE', 'ARTICLE', 'METAOBJECT', 'METAFIELD', 'ONLINE_STORE_THEME'). Defaults to 'PRODUCT'."),
    limitPerType: z.number().int().min(1).max(200).optional().default(20)
      .describe("The maximum number of resources to translate per type. Defaults to 20, max 200."),
  }),
  func: async ({ sourceLocale, targetLocale, resourceTypes, limitPerType }, context) => {
    if (!sourceLocale || !targetLocale) {
      return "源语言和目标语言是必填项，请提供。";
    }

    const job = await createTranslationJob({
      sourceLocale,
      targetLocale,
      resourceTypes: resourceTypes || ["PRODUCT"],
      limitPerType: limitPerType || 20,
      shop: context.shop,
    });
    return `翻译任务已创建：${job.jobId}`; 
  },
});
