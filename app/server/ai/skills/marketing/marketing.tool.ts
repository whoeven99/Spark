import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { DEFAULT_DESCRIPTION_TEMPERATURE } from "../../../productImprove/constants.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";
import { fetchShopLocalesPayload } from "../../../productImprove/shopLocalesFetcher.server";
import { runProductDescriptionGeneration } from "../../../productImprove/services/generateDescriptionService";
import type { AgentContext } from "../../core/toolRegistry.server";

export const GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME =
  "generate_product_description";

/**
 * LangChain Tool：由 AI Assistant 调用，内部走商品上下文拉取 + Prompt + LLM，返回 JSON 字符串。
 */
export function createGenerateProductDescriptionTool(context: AgentContext) {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME,
    description:
      "根据 Shopify 商品 ID 生成该商品的营销型商品描述（结构化 JSON 中的 description 字段）。当用户要求生成、撰写、优化商品描述或营销文案，且已提供或可推断商品 ID 时使用。不要在未给出商品 ID 时猜测 ID。",
    schema: z.object({
      productId: z
        .string()
        .min(1)
        .describe(
          "Shopify 商品 ID，可为纯数字或 gid://shopify/Product/… 完整 GID",
        ),
      targetLanguage: z
        .string()
        .optional()
        .describe(
          "目标语言 BCP47，如 zh-CN、en、ja；缺省时由 Admin API shopLocales 解析店铺主语言（失败则回退内置列表默认 en）",
        ),
    }),
    func: async ({ productId, targetLanguage }) => {
      const requestId = crypto.randomUUID();
      console.info(
        `[GenerateDescription][Tool Start] requestId=${requestId} tool=${GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME} productId=${productId}`,
      );
      try {
        let resolvedLang = (targetLanguage ?? "").trim();
        if (!resolvedLang) {
          const locales = await fetchShopLocalesPayload(
            admin,
            `toolDefaultLang requestId=${requestId}`,
          );
          resolvedLang = locales.defaultTargetLanguage;
          console.info(
            `[GenerateDescription][Tool] requestId=${requestId} inferred targetLanguage=${resolvedLang} fallback=${locales.isFallback}`,
          );
        }
        const result = await runProductDescriptionGeneration({
          admin,
          productId: productId.trim(),
          targetLanguage: resolvedLang,
          temperature: DEFAULT_DESCRIPTION_TEMPERATURE,
          requestId,
          ...(context.shop
            ? {
                tokenContext: { shop: context.shop },
              }
            : {}),
        });
        if (!result.ok) {
          console.info(
            `[GenerateDescription][Tool Error] requestId=${requestId} errorCode=${String(result.errorCode)} errorMsg=${result.errorMsg}`,
          );
          return JSON.stringify({
            ok: false,
            errorCode: result.errorCode,
            errorMsg: result.errorMsg,
          });
        }
        console.info(
          `[GenerateDescription][Tool Success] requestId=${requestId} descriptionLen=${result.data.description.length}`,
        );
        return JSON.stringify({
          ok: true,
          productId: productId.trim(),
          targetLanguage: resolvedLang,
          title: result.data.title,
          description: result.data.description,
        });
      } catch (e) {
        logDetailedError(
          `[GenerateDescription][Tool Error] requestId=${requestId}`,
          "generate_product_description unexpected",
          e,
        );
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({
          ok: false,
          errorCode: 500,
          errorMsg: msg,
        });
      }
    },
  });
}
