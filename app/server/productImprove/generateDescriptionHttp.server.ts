import { z } from "zod";
import { getAppEntry } from "../../config/appEntry.server";
import {
  billingErrorToResponse,
  requireBillingAccess,
} from "../billing/index.server";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import {
  DEFAULT_DESCRIPTION_TEMPERATURE,
  MAX_DESCRIPTION_TEMPERATURE,
  MIN_DESCRIPTION_TEMPERATURE,
} from "./constants.server";
import {
  isAgentRunLogEnabled,
  recordAgentRun,
  resolveAgentRunStatus,
} from "../agentRunLog/index.server";
import { parseUsageMetadata } from "../tokenUsage/parseUsageMetadata.server";
import { logDetailedError } from "./generateDescriptionLog.server";
import { runProductDescriptionGeneration } from "./services/generateDescriptionService";
import type { GenerateDescriptionApiResponse } from "../../lib/productImproveTypes";

const LOG_PREFIX = "[GenerateDescription][HTTP]";

const requestBodySchema = z.object({
  shop: z.string().min(1).optional(),
  productId: z.string().min(1, "productId 必填"),
  targetLanguage: z.string().min(1, "targetLanguage 必填"),
  temperature: z
    .number()
    .min(MIN_DESCRIPTION_TEMPERATURE)
    .max(MAX_DESCRIPTION_TEMPERATURE)
    .optional(),
});

export type ParsedGenerateDescriptionBody = z.infer<typeof requestBodySchema>;

export function parseGenerateDescriptionBody(
  raw: unknown,
):
  | { ok: true; data: ParsedGenerateDescriptionBody }
  | { ok: false; errorMsg: string } {
  try {
    const data = requestBodySchema.parse(raw);
    return { ok: true, data };
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join("；")
        : "请求体不是合法 JSON";
    return { ok: false, errorMsg: msg };
  }
}

function jsonBody(
  body: GenerateDescriptionApiResponse,
  status: number,
): { status: number; body: GenerateDescriptionApiResponse } {
  return { status, body };
}

/**
 * 鉴权完成后执行生成逻辑，供 API route 与 `/app/generate-description` action 共用。
 */
export async function executeGenerateDescriptionRequest(params: {
  requestId: string;
  admin: ShopifyAdminGraphqlClient;
  sessionShop: string;
  parsed: ParsedGenerateDescriptionBody;
}): Promise<{ status: number; body: GenerateDescriptionApiResponse }> {
  const { requestId, admin, sessionShop, parsed } = params;
  const routeStart = Date.now();
  const startedAtIso = new Date().toISOString();
  const appName = getAppEntry();

  const persistRun = (input: {
    status: "success" | "error";
    errorCode?: number;
    errorMsg?: string;
    usageMeta?: unknown;
  }) => {
    if (!isAgentRunLogEnabled()) return;
    const durationMs = Date.now() - routeStart;
    const usage = parseUsageMetadata(input.usageMeta);
    recordAgentRun({
      runId: requestId,
      shop: sessionShop,
      appName,
      feature: "generate_description",
      status: resolveAgentRunStatus({
        explicitStatus: input.status,
        durationMs,
      }),
      startedAt: startedAtIso,
      durationMs,
      inputSummary: {
        productId: parsed.productId,
        targetLanguage: parsed.targetLanguage,
      },
      tokenUsage:
        usage.totalTokens > 0
          ? {
              prompt: usage.inputTokens,
              completion: usage.outputTokens,
              total: usage.totalTokens,
            }
          : undefined,
      error:
        input.status === "error"
          ? {
              code: input.errorCode != null ? String(input.errorCode) : undefined,
              message: input.errorMsg ?? "unknown",
            }
          : undefined,
      refs: { requestId },
    });
  };

  console.info(
    `${LOG_PREFIX} requestId=${requestId} execute start shop=${sessionShop} productId=${parsed.productId}`,
  );

  const shopParam = parsed.shop?.trim();
  if (shopParam && shopParam !== sessionShop) {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} shop mismatch session=${sessionShop} param=${shopParam}`,
    );
    persistRun({
      status: "error",
      errorCode: 403,
      errorMsg: "shop 与当前会话店铺不一致",
    });
    return jsonBody(
      {
        success: false,
        errorCode: 403,
        errorMsg: "shop 与当前会话店铺不一致",
        response: null,
      },
      403,
    );
  }

  const temperature = parsed.temperature ?? DEFAULT_DESCRIPTION_TEMPERATURE;

  try {
    await requireBillingAccess(sessionShop, getAppEntry());

    const result = await runProductDescriptionGeneration({
      admin,
      productId: parsed.productId,
      targetLanguage: parsed.targetLanguage,
      temperature,
      requestId,
      tokenContext: {
        shop: sessionShop,
        appName: getAppEntry(),
      },
    });

    const durationMs = Date.now() - routeStart;

    if (!result.ok) {
      const status =
        result.errorCode === 40401
          ? 404
          : result.errorCode === 42201
            ? 422
            : 503;
      console.info(
        JSON.stringify({
          event: "generateDescription",
          outcome: "error",
          requestId,
          shop: sessionShop,
          productId: parsed.productId,
          errorCode: result.errorCode,
          durationMs,
        }),
      );
      persistRun({
        status: "error",
        errorCode: result.errorCode,
        errorMsg: result.errorMsg,
      });
      return jsonBody(
        {
          success: false,
          errorCode: result.errorCode,
          errorMsg: result.errorMsg,
          response: null,
        },
        status,
      );
    }

    console.info(
      JSON.stringify({
        event: "generateDescription",
        outcome: "ok",
        requestId,
        shop: sessionShop,
        productId: parsed.productId,
        model: result.modelLabel,
        durationMs,
        tokenUsage: result.usageMeta ?? null,
      }),
    );
    persistRun({ status: "success", usageMeta: result.usageMeta });

    console.log("[GenerateDescription] product title:", result.data.title);

    return jsonBody(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: {
          title: result.data.title,
          description: result.data.description,
        },
      },
      200,
    );
  } catch (error) {
    const billingResponse = billingErrorToResponse(error);
    if (billingResponse) {
      const body = (await billingResponse.json()) as {
        errorMsg?: string;
        errorCode?: string;
      };
      persistRun({
        status: "error",
        errorCode: 402,
        errorMsg: body.errorMsg ?? "需要订阅或购买积分",
      });
      return jsonBody(
        {
          success: false,
          errorCode: 402,
          errorMsg: body.errorMsg ?? "需要订阅或购买积分",
          response: null,
        },
        402,
      );
    }

    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "executeGenerateDescriptionRequest unexpected",
      error,
    );
    const message = error instanceof Error ? error.message : "请求处理失败";
    persistRun({ status: "error", errorCode: 500, errorMsg: message });
    return jsonBody(
      {
        success: false,
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      500,
    );
  }
}
