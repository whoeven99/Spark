import { z } from "zod";
import { getAppEntry } from "../../config/appEntry.server";
import {
  imageUrlToHost,
  isAgentRunLogEnabled,
  recordAgentRun,
  resolveAgentRunStatus,
} from "../agentRunLog/index.server";
import { executePictureTranslatePipeline } from "./pictureTranslateExecutor.server";
import { persistPictureTranslateSuccess } from "./pictureTranslatePersist.server";
import {
  getExtensionFromUrl,
  mapZhTwToZhHantForVolcano,
} from "./pictureTranslatePictureUtils.server";
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
  return {
    status,
    body: { success: false, errorCode, errorMsg },
  };
}

function ok(imageUrl: string): { status: number; body: PictureTranslateResponse } {
  return { status: 200, body: { success: true, imageUrl } };
}

function mapPipelineFailure(
  reason: string,
  detail: string | undefined,
  modelType: 1 | 2,
): { status: number; body: PictureTranslateResponse } {
  if (reason === "language_pair_not_supported") {
    const label = modelType === 1 ? "Aidge" : "火山";
    return err(
      40003,
      `当前源语言与目标语言组合不支持${label}整图翻译`,
      400,
    );
  }
  if (reason === "auto_requires_explicit_source") {
    return err(40004, "请提供明确的 sourceCode，不支持 auto", 400);
  }
  if (reason === "image_format_invalid") {
    return err(
      40002,
      modelType === 1
        ? "当前模型不支持该图片格式。Aidge 支持 png、jpg、jpeg、bmp、webp。"
        : "当前模型不支持该图片格式。火山整图翻译仅支持 png、jpg（不含 jpeg 后缀）。",
      400,
    );
  }
  if (reason === "image_fetch_failed") {
    return err(50302, "下载源图失败，请检查 imageUrl 是否可访问", 503);
  }
  if (reason === "blob_upload_failed") {
    return err(50303, "译图上传至 Blob 失败", 503);
  }
  if (reason === "volc_failed") {
    if (detail?.includes("volc_credentials_missing")) {
      return err(
        50304,
        "火山访问未配置：请设置 HUOSHAN_API_KEY / HUOSHAN_API_SECRET（或 VOLC_ACCESSKEY / VOLC_SECRETKEY）",
        503,
      );
    }
    const isUpstreamParse = detail?.includes("volc_response_parse_failed");
    const status = isUpstreamParse ? 502 : 503;
    const errorCode = isUpstreamParse ? 50201 : 50301;
    const errorMsg =
      detail != null && detail.length > 0
        ? `火山整图翻译失败：${detail}`
        : "火山整图翻译失败";
    return err(errorCode, errorMsg, status);
  }
  if (reason === "aidge_failed") {
    if (detail?.includes("aidge_credentials_missing")) {
      return err(
        50305,
        "Aidge 访问未配置：请设置 AIDGE_ACCESS_KEY_ID 与 AIDGE_ACCESS_KEY_SECRET",
        503,
      );
    }
    const errorMsg =
      detail != null && detail.length > 0
        ? `Aidge 整图翻译失败：${detail}`
        : "Aidge 整图翻译失败";
    return err(50306, errorMsg, 503);
  }
  return err(50001, "整图翻译失败", 500);
}

/**
 * 鉴权完成后执行整图翻译；`modelType=1` 仅 Aidge，`modelType=2` 仅火山（不做交叉 fallback）。
 */
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
      `${LOG_PREFIX} Request validated blocked — shop mismatch session=${sessionShop} param=${shopParam} clientRequestId=${clientRequestId}`,
    );
    persistRun({
      status: "error",
      errorCode: 40301,
      errorMsg: "shop 与当前会话店铺不一致",
    });
    return err(40301, "shop 与当前会话店铺不一致", 403);
  }

  const billingStrict =
    process.env.PICTURE_TRANSLATE_BILLING_STRICT?.trim() === "true";
  if (billingStrict) {
    console.info(
      `${LOG_PREFIX} billing strict — blocked clientRequestId=${clientRequestId} shop=${sessionShop}`,
    );
    persistRun({
      status: "error",
      errorCode: 50102,
      errorMsg:
        "计费未接入：已设置 PICTURE_TRANSLATE_BILLING_STRICT=true，整图翻译在扣费对齐前被硬阻断",
    });
    return err(
      50102,
      "计费未接入：已设置 PICTURE_TRANSLATE_BILLING_STRICT=true，整图翻译在扣费对齐前被硬阻断",
      501,
    );
  }

  console.info(
    `${LOG_PREFIX} Billing noop — clientRequestId=${clientRequestId} shop=${sessionShop} modelType=${parsed.modelType}`,
  );

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
    `${LOG_PREFIX} Request validated — shop=${sessionShop} modelType=${parsed.modelType} clientRequestId=${clientRequestId} ext=${extensionRaw} source=${sourceForLog} target=${targetForLog}`,
  );

  const pipeline = await executePictureTranslatePipeline({
    requestId: clientRequestId,
    shop: sessionShop,
    imageUrl: parsed.imageUrl,
    sourceLanguage: parsed.sourceCode,
    targetLanguage: parsed.targetCode,
    forceModelType: parsed.modelType,
  });

  if (!pipeline.ok) {
    console.info(
      `${LOG_PREFIX} Translation done — failure reason=${pipeline.reason} provider=${pipeline.provider ?? "n/a"} detail=${pipeline.detail ?? "n/a"} clientRequestId=${clientRequestId}`,
    );
    const failure = mapPipelineFailure(
      pipeline.reason,
      pipeline.detail,
      parsed.modelType,
    );
    if (!failure.body.success) {
      persistRun({
        status: "error",
        errorCode: failure.body.errorCode,
        errorMsg: failure.body.errorMsg,
      });
    }
    return failure;
  }

  console.info(
    `${LOG_PREFIX} Translation done — success provider=${pipeline.provider} clientRequestId=${clientRequestId}`,
  );
  await persistPictureTranslateSuccess({
    requestId: clientRequestId,
    shop: sessionShop,
    sourceLanguage: parsed.sourceCode,
    targetLanguage: parsed.targetCode,
    pipeline,
    extraMetadata: {
      modelType: parsed.modelType,
      imageUrlHost: imageUrlToHost(parsed.imageUrl),
    },
  });
  persistRun({ status: "success" });
  return ok(pipeline.imageUrl);
}
