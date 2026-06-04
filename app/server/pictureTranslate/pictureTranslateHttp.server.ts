import { z } from "zod";
import { getAppEntry } from "../../config/appEntry.server";
import { billingErrorToResponse } from "../billing/index.server";
import {
  requireVisualToolBillingAccess,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "../tokenUsage/index.server";
import {
  imageUrlToHost,
  isAgentRunLogEnabled,
  recordAgentRun,
  resolveAgentRunStatus,
} from "../agentRunLog/index.server";
import {
  getExtensionFromUrl,
  mapZhTwToZhHantForVolcano,
} from "./pictureTranslatePictureUtils.server";
import { createBatchWithTask } from "../aiTask/aiTaskStore.server";
import { enqueuePictureTranslateTask } from "./pictureTranslateAsync.server";
import type { PictureTranslateResponse } from "./pictureTranslateTypes.server";

const LOG_PREFIX = "[PictureTranslate][HTTP]";

const requestBodySchema = z.object({
  imageUrl: z
    .string()
    .min(1, "imageUrl 必填")
    .refine((u) => /^https:\/\//i.test(u), "imageUrl 必须为 HTTPS"),
  sourceCode: z.string().min(1, "sourceCode 必填"),
  targetCode: z.string().min(1, "targetCode 必填"),
  modelType: z.union([z.literal(1), z.literal(2)]),
  shop: z.string().min(1).optional(),
  requestId: z.string().optional(),
});

export type ParsedPictureTranslateBody = z.infer<typeof requestBodySchema>;

export function parsePictureTranslateBody(
  raw: unknown,
):
  | { ok: true; data: ParsedPictureTranslateBody }
  | { ok: false; errorMsg: string } {
  try {
    const data = requestBodySchema.parse(raw);
    return { ok: true, data };
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join("；")
        : "请求体校验失败";
    return { ok: false, errorMsg: msg };
  }
}

function err(
  errorCode: number,
  errorMsg: string,
  status: number,
): { status: number; body: PictureTranslateResponse } {
  return { status, body: { success: false, errorCode, errorMsg } };
}

export async function executePictureTranslateRequest(params: {
  requestId: string;
  sessionShop: string;
  parsed: ParsedPictureTranslateBody;
}): Promise<{ status: number; body: PictureTranslateResponse }> {
  const { requestId, sessionShop, parsed } = params;
  const clientRequestId = parsed.requestId?.trim() || requestId;
  const routeStart = Date.now();
  const startedAtIso = new Date().toISOString();
  const appName = getAppEntry();
  const runId = clientRequestId;

  const persistRun = (input: {
    status: "success" | "error";
    errorCode?: number;
    errorMsg?: string;
  }) => {
    if (!isAgentRunLogEnabled()) return;
    const durationMs = Date.now() - routeStart;
    recordAgentRun({
      runId,
      shop: sessionShop,
      appName,
      feature: "picture_translate",
      status: resolveAgentRunStatus({
        explicitStatus: input.status,
        durationMs,
      }),
      startedAt: startedAtIso,
      durationMs,
      inputSummary: {
        imageUrlHost: imageUrlToHost(parsed.imageUrl),
        sourceCode: parsed.sourceCode,
        targetCode: parsed.targetCode,
        modelType: parsed.modelType,
      },
      error:
        input.status === "error"
          ? {
              code: input.errorCode != null ? String(input.errorCode) : undefined,
              message: input.errorMsg ?? "unknown",
            }
          : undefined,
      refs: { requestId: clientRequestId },
    });
  };

  const shopParam = parsed.shop?.trim();
  if (shopParam && shopParam !== sessionShop) {
    console.info(
      `${LOG_PREFIX} blocked — shop mismatch session=${sessionShop} param=${shopParam} clientRequestId=${clientRequestId}`,
    );
    persistRun({ status: "error", errorCode: 40301, errorMsg: "shop 与当前会话店铺不一致" });
    return err(40301, "shop 与当前会话店铺不一致", 403);
  }

  try {
    await requireVisualToolBillingAccess(sessionShop, appName);
  } catch (error) {
    const billingResponse = billingErrorToResponse(error);
    if (billingResponse) {
      const body = (await billingResponse.json()) as { errorMsg?: string };
      const errorMsg =
        body.errorMsg ?? "Token 余额不足或尚未订阅，请前往套餐页开通";
      persistRun({ status: "error", errorCode: 40201, errorMsg });
      return err(40201, errorMsg, 402);
    }
    throw error;
  }

  const extensionRaw = getExtensionFromUrl(parsed.imageUrl);
  if (extensionRaw == null) {
    persistRun({ status: "error", errorCode: 40001, errorMsg: "图片格式无法识别" });
    return err(40001, "图片格式无法识别", 400);
  }

  const sourceForLog =
    parsed.modelType === 2
      ? mapZhTwToZhHantForVolcano(parsed.sourceCode)
      : parsed.sourceCode;
  const targetForLog =
    parsed.modelType === 2
      ? mapZhTwToZhHantForVolcano(parsed.targetCode)
      : parsed.targetCode;

  console.info(
    `${LOG_PREFIX} validated — shop=${sessionShop} modelType=${parsed.modelType} clientRequestId=${clientRequestId} ext=${extensionRaw} source=${sourceForLog} target=${targetForLog}`,
  );

  const { taskId, batchId } = await createBatchWithTask({
    shop: sessionShop,
    appName,
    taskType: "picture_translate",
    batchConfig: {
      imageUrl: parsed.imageUrl,
      sourceCode: parsed.sourceCode,
      targetCode: parsed.targetCode,
      modelType: parsed.modelType,
    },
    taskConfig: {
      imageUrl: parsed.imageUrl,
      sourceCode: parsed.sourceCode,
      targetCode: parsed.targetCode,
      modelType: parsed.modelType,
    },
    estimatedCredits: DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
  });

  enqueuePictureTranslateTask({
    taskId,
    shop: sessionShop,
    imageUrl: parsed.imageUrl,
    sourceCode: parsed.sourceCode,
    targetCode: parsed.targetCode,
    modelType: parsed.modelType,
  });

  persistRun({ status: "success" });

  return {
    status: 202,
    body: { success: true, taskId, batchId, status: "running" },
  };
}
