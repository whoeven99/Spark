import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/tool";
import { getAppEntry } from "../../../config/appEntry.server";
import {
  parseUsageMetadata,
  recordTokenUsage,
} from "../../tokenUsage/index.server";
import { invokeDescriptionModels } from "../descriptionAiClient.server";
import { parseAndValidateProductDescriptionJson } from "../generatedDescriptionJson.server";
import { logDetailedError } from "../generateDescriptionLog.server";
import {
  buildDescriptionSystemPrompt,
  buildDescriptionUserPrompt,
  logPromptBuildMeta,
} from "../prompts/generateDescriptionPrompt";
import { fetchProductDescriptionContext } from "../productContextFetcher.server";
import {
  DEFAULT_DESCRIPTION_TEMPERATURE,
  MAX_DESCRIPTION_TEMPERATURE,
  MIN_DESCRIPTION_TEMPERATURE,
} from "../constants.server";

const LOG = "[GenerateDescription][Service]";

/** 成功路径下返回给 HTTP / Tool 的载荷：description 来自模型 JSON，title 来自 Shopify 商品。 */
export type GenerateDescriptionOkPayload = {
  title: string;
  description: string;
};

export type GenerateDescriptionServiceResult =
  | {
      ok: true;
      data: GenerateDescriptionOkPayload;
      modelLabel: string;
      usageMeta?: unknown;
    }
  | { ok: false; errorCode: number; errorMsg: string };

/** 业务错误码：与 HTTP 状态分离，便于前端分支。 */
export const GENERATE_DESCRIPTION_ERROR = {
  PRODUCT_NOT_FOUND: 40401,
  NO_AI_CREDENTIALS: 50301,
  GENERATION_FAILED: 50302,
  INVALID_AI_OUTPUT: 42201,
} as const;

function clampTemperature(t: number): number {
  if (!Number.isFinite(t)) return DEFAULT_DESCRIPTION_TEMPERATURE;
  return Math.min(
    MAX_DESCRIPTION_TEMPERATURE,
    Math.max(MIN_DESCRIPTION_TEMPERATURE, t),
  );
}

/**
 * 生成商品营销描述：拉取商品上下文 → 构建 Prompt → 调用 LLM → 校验结构化 JSON。
 * 所有异步步骤均带 requestId 日志。
 */
export type GenerateDescriptionTokenContext = {
  shop: string;
  appName?: string;
};

export async function runProductDescriptionGeneration(params: {
  admin: ShopifyAdminGraphqlClient;
  productId: string;
  targetLanguage: string;
  temperature?: number;
  requestId: string;
  tokenContext?: GenerateDescriptionTokenContext;
}): Promise<GenerateDescriptionServiceResult> {
  const serviceStart = Date.now();
  const {
    admin,
    productId,
    targetLanguage,
    requestId,
    temperature: rawTemp,
  } = params;
  const temperature = clampTemperature(rawTemp ?? DEFAULT_DESCRIPTION_TEMPERATURE);

  console.info(
    `${LOG} [Fetch Product] requestId=${requestId} start productId=${productId}`,
  );

  let context;
  try {
    context = await fetchProductDescriptionContext(admin, productId);
    console.info(
      `${LOG} [Fetch Product] requestId=${requestId} done hasContext=${Boolean(context)}`,
    );
  } catch (e) {
    logDetailedError(
      `${LOG} [Fetch Product] requestId=${requestId}`,
      "fetchProductDescriptionContext failed",
      e,
    );
    console.info(
      `${LOG} [Tool Error] requestId=${requestId} totalMs=${Date.now() - serviceStart}`,
    );
    return {
      ok: false,
      errorCode: GENERATE_DESCRIPTION_ERROR.GENERATION_FAILED,
      errorMsg: e instanceof Error ? e.message : "Shopify 查询失败",
    };
  }

  if (!context) {
    console.info(
      `${LOG} [Fetch Product] requestId=${requestId} not found productId=${productId}`,
    );
    return {
      ok: false,
      errorCode: GENERATE_DESCRIPTION_ERROR.PRODUCT_NOT_FOUND,
      errorMsg: "未找到对应商品或无权访问",
    };
  }

  console.log("[GenerateDescription] product title:", context.title);

  console.info(
    `${LOG} [Prompt Build] requestId=${requestId} context.id=${context.id} titleLen=${context.title.length}`,
  );
  const systemPrompt = buildDescriptionSystemPrompt();
  const userPrompt = buildDescriptionUserPrompt(context, targetLanguage);
  logPromptBuildMeta(requestId, systemPrompt.length, userPrompt.length);

  let raw: { rawText: string; modelLabel: string; usageMeta?: unknown };
  try {
    console.info(`${LOG} [LLM Request] requestId=${requestId} start`);
    raw = await invokeDescriptionModels(
      systemPrompt,
      userPrompt,
      temperature,
      requestId,
    );
    console.info(
      `${LOG} [LLM Response] requestId=${requestId} model=${raw.modelLabel} rawLen=${raw.rawText.length}`,
    );
  } catch (e) {
    logDetailedError(
      `${LOG} [LLM Request] requestId=${requestId}`,
      "invokeDescriptionModels failed",
      e,
    );
    const msg =
      e instanceof Error && e.message.includes("DEEPSEEK_API_KEY")
        ? "未配置可用的 AI 密钥"
        : e instanceof Error
          ? e.message
          : "模型调用失败";
    const code = msg.includes("未配置")
      ? GENERATE_DESCRIPTION_ERROR.NO_AI_CREDENTIALS
      : GENERATE_DESCRIPTION_ERROR.GENERATION_FAILED;
    console.info(
      `${LOG} [Tool Error] requestId=${requestId} totalMs=${Date.now() - serviceStart}`,
    );
    return { ok: false, errorCode: code, errorMsg: msg };
  }

  try {
    const aiPayload = parseAndValidateProductDescriptionJson(raw.rawText);
    const data: GenerateDescriptionOkPayload = {
      title: context.title,
      description: aiPayload.description,
    };

    const tokenCtx = params.tokenContext;
    if (tokenCtx?.shop.trim()) {
      const usage = parseUsageMetadata(raw.usageMeta);
      if (usage.totalTokens > 0) {
        await recordTokenUsage({
          shop: tokenCtx.shop.trim(),
          appName: tokenCtx.appName?.trim() || getAppEntry(),
          usage,
        });
      }
    }

    console.info(
      `${LOG} [Tool Success] requestId=${requestId} descriptionLen=${data.description.length} totalMs=${Date.now() - serviceStart}`,
    );
    return {
      ok: true,
      data,
      modelLabel: raw.modelLabel,
      usageMeta: raw.usageMeta,
    };
  } catch (e) {
    logDetailedError(
      `${LOG} [LLM Response] requestId=${requestId}`,
      "parseAndValidateProductDescriptionJson failed",
      e,
    );
    console.info(
      `${LOG} [Tool Error] requestId=${requestId} totalMs=${Date.now() - serviceStart}`,
    );
    return {
      ok: false,
      errorCode: GENERATE_DESCRIPTION_ERROR.INVALID_AI_OUTPUT,
      errorMsg: e instanceof Error ? e.message : "AI 输出结构异常",
    };
  }
}
