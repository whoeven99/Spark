import { z } from "zod";
import { logDetailedError } from "../generateDescription/generateDescriptionLog.server";
import { uploadPictureTranslateJpegAndGetUrl } from "./pictureTranslateBlob.server";
import {
  getExtensionFromUrl,
  isDifferentImageTranslateInputCode,
  isSupportModelAndImageType,
  mapZhTwToZhHantForVolcano,
} from "./pictureTranslatePictureUtils.server";
import type { PictureTranslateResponse } from "./pictureTranslateTypes.server";
import {
  fetchSourceImageBytes,
  volcengineTranslateImageToBytes,
} from "./volcenginePictureTranslate.server";

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

/**
 * 鉴权完成后执行整图翻译（火山路径）；与 Spring `POST /pcUserPic/translatePic` 的 modelType=2 语义对齐。
 *
 * 与 Spring 差异（一期）：
 * - `modelType === 1`（Aidge）：未实现，返回 501。
 * - 未接入 Spring `APP_PIC_FEE` / PC 用户点数扣费；默认仍执行译图，见 `PROJECT_CONTEXT.md` 说明。若需硬阻断可设 `PICTURE_TRANSLATE_BILLING_STRICT=true`。
 */
export async function executePictureTranslateRequest(params: {
  requestId: string;
  sessionShop: string;
  parsed: ParsedPictureTranslateBody;
}): Promise<{ status: number; body: PictureTranslateResponse }> {
  const { requestId, sessionShop, parsed } = params;
  const clientRequestId = parsed.requestId?.trim() || requestId;

  const shopParam = parsed.shop?.trim();
  if (shopParam && shopParam !== sessionShop) {
    console.info(
      `${LOG_PREFIX} Request validated blocked — shop mismatch session=${sessionShop} param=${shopParam} clientRequestId=${clientRequestId}`,
    );
    return err(40301, "shop 与当前会话店铺不一致", 403);
  }

  if (parsed.modelType === 1) {
    console.info(
      `${LOG_PREFIX} modelType=1 (Aidge) not implemented clientRequestId=${clientRequestId} shop=${sessionShop}`,
    );
    return err(
      50101,
      "Aidge 整图翻译（modelType=1）在 Spark 一期未实现；请使用 modelType=2（火山）",
      501,
    );
  }

  const billingStrict =
    process.env.PICTURE_TRANSLATE_BILLING_STRICT?.trim() === "true";
  if (billingStrict) {
    console.info(
      `${LOG_PREFIX} billing strict — blocked before Volcano clientRequestId=${clientRequestId} shop=${sessionShop}`,
    );
    return err(
      50102,
      "计费未接入：已设置 PICTURE_TRANSLATE_BILLING_STRICT=true，整图翻译在扣费对齐前被硬阻断",
      501,
    );
  }

  console.info(
    `${LOG_PREFIX} Billing noop — Spark 一期未接入 Spring APP_PIC_FEE / PC 用户点数扣费；仍将执行译图。clientRequestId=${clientRequestId} shop=${sessionShop}`,
  );

  const extensionRaw = getExtensionFromUrl(parsed.imageUrl);
  let sourceForVolcano = parsed.sourceCode;
  let targetForVolcano = parsed.targetCode;
  if (parsed.modelType === 2) {
    sourceForVolcano = mapZhTwToZhHantForVolcano(parsed.sourceCode);
    targetForVolcano = mapZhTwToZhHantForVolcano(parsed.targetCode);
  }

  if (extensionRaw == null) {
    return err(40001, "图片格式无法识别", 400);
  }

  const extLower = extensionRaw.toLowerCase();
  if (!isSupportModelAndImageType(extLower, parsed.modelType)) {
    return err(
      40002,
      "当前模型不支持该图片格式。火山整图翻译仅支持 png、jpg（不含 jpeg 后缀）。",
      400,
    );
  }

  if (
    !isDifferentImageTranslateInputCode(
      sourceForVolcano,
      targetForVolcano,
      parsed.modelType,
    )
  ) {
    return err(
      40003,
      "当前源语言与目标语言组合不支持火山整图翻译",
      400,
    );
  }

  console.info(
    `${LOG_PREFIX} Request validated — shop=${sessionShop} modelType=${parsed.modelType} clientRequestId=${clientRequestId} ext=${extLower} sourceMapped=${sourceForVolcano} targetMapped=${targetForVolcano}`,
  );

  const fetched = await fetchSourceImageBytes(parsed.imageUrl);
  if (!fetched.ok) {
    console.info(
      `${LOG_PREFIX} Translation done — failure image fetch reason=${fetched.reasonCode} clientRequestId=${clientRequestId}`,
    );
    return err(50302, "下载源图失败，请检查 imageUrl 是否可访问", 503);
  }

  console.info(
    `${LOG_PREFIX} Translation start — Volcano image translate clientRequestId=${clientRequestId} targetLanguage=${targetForVolcano}`,
  );

  const translated = await volcengineTranslateImageToBytes({
    imageBytes: fetched.bytes,
    targetLanguage: targetForVolcano,
  });

  if (!translated.ok) {
    console.info(
      `${LOG_PREFIX} Translation done — Volcano failure reason=${translated.reasonCode} clientRequestId=${clientRequestId}`,
    );
    if (translated.reasonCode === "volc_credentials_missing") {
      return err(
        50304,
        "火山访问未配置：请设置 HUOSHAN_API_KEY / HUOSHAN_API_SECRET（或 VOLC_ACCESSKEY / VOLC_SECRETKEY）",
        503,
      );
    }
    const isUpstreamParse = translated.reasonCode === "volc_response_parse_failed";
    const status = isUpstreamParse ? 502 : 503;
    const errorCode = isUpstreamParse ? 50201 : 50301;
    const errorMsg =
      translated.detail != null && translated.detail.length > 0
        ? `火山整图翻译失败（${translated.reasonCode}）：${translated.detail}`
        : `火山整图翻译失败（${translated.reasonCode}）`;
    return err(errorCode, errorMsg, status);
  }

  try {
    const imageUrl = await uploadPictureTranslateJpegAndGetUrl({
      shop: sessionShop,
      jpegBytes: translated.bytes,
    });
    console.info(
      `${LOG_PREFIX} Translation done — success blob public/sas url ready clientRequestId=${clientRequestId}`,
    );
    return ok(imageUrl);
  } catch (e) {
    logDetailedError(
      `${LOG_PREFIX} clientRequestId=${clientRequestId}`,
      "uploadPictureTranslateJpegAndGetUrl",
      e,
    );
    return err(50303, "译图上传至 Blob 失败", 503);
  }
}
