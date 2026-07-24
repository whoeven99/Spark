import {
  normalizeBillingModelKey,
  parseUsageMetadata,
  recordBilledTokenUsage,
} from "../../tokenUsage/index.server";
import { invokeDescriptionModels } from "../descriptionAiClient.server";
import { DEFAULT_DESCRIPTION_TEMPERATURE } from "../constants.server";
import { parseAndValidateProductDescriptionReviewJson } from "../generatedDescriptionJson.server";
import { logDetailedError } from "../generateDescriptionLog.server";
import {
  buildDescriptionRefineSystemPrompt,
  buildDescriptionRefineUserPrompt,
} from "../prompts/generateDescriptionPrompt";
import type { ProductDescriptionContext } from "../productContextFetcher.server";

const LOG = "[RefineDescription][Service]";

export async function runProductDescriptionRefinement(params: {
  shop: string;
  context: ProductDescriptionContext;
  targetLanguage: string;
  currentTitle: string;
  currentDescription: string;
  optimizationComment: string;
  requestId: string;
  temperature?: number;
}): Promise<
  | {
      ok: true;
      data: { title: string; description: string };
      modelLabel: string;
      usageMeta?: unknown;
    }
  | { ok: false; errorCode: number; errorMsg: string }
> {
  const startedAt = Date.now();
  const temperature = params.temperature ?? DEFAULT_DESCRIPTION_TEMPERATURE;

  const systemPrompt = buildDescriptionRefineSystemPrompt();
  const userPrompt = buildDescriptionRefineUserPrompt({
    context: params.context,
    targetLanguage: params.targetLanguage,
    currentTitle: params.currentTitle,
    currentDescription: params.currentDescription,
    optimizationComment: params.optimizationComment,
  });

  let raw: { rawText: string; modelLabel: string; usageMeta?: unknown };
  try {
    raw = await invokeDescriptionModels(
      systemPrompt,
      userPrompt,
      temperature,
      params.requestId,
    );
  } catch (e) {
    logDetailedError(`${LOG} requestId=${params.requestId}`, "invokeDescriptionModels failed", e);
    return {
      ok: false,
      errorCode: 50301,
      errorMsg: e instanceof Error ? e.message : "AI 优化失败",
    };
  }

  try {
    const payload = parseAndValidateProductDescriptionReviewJson(raw.rawText);
    const usage = parseUsageMetadata(raw.usageMeta);
    if (usage.totalTokens > 0) {
      await recordBilledTokenUsage({
        shop: params.shop,
        feature: "product_copy",
        modelKey: normalizeBillingModelKey(raw.modelLabel),
        usage,
      });
    }

    console.info(
      `${LOG} requestId=${params.requestId} ok totalMs=${Date.now() - startedAt}`,
    );
    return {
      ok: true,
      data: payload,
      modelLabel: raw.modelLabel,
      usageMeta: raw.usageMeta,
    };
  } catch (e) {
    logDetailedError(
      `${LOG} requestId=${params.requestId}`,
      "parseAndValidateProductDescriptionReviewJson failed",
      e,
    );
    return {
      ok: false,
      errorCode: 42201,
      errorMsg: e instanceof Error ? e.message : "AI 输出结构异常",
    };
  }
}
