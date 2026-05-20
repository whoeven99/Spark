import { Service } from "@volcengine/openapi";
import { z } from "zod";
import { readVolcengineCredentials } from "../volcengine/volcCredentials.server";

const LOG_PREFIX = "[PictureTranslate][Volc]";

const VOLCANO_TRANSLATE_HOST = "translate.volcengineapi.com";
const TRANSLATE_IMAGE_ACTION = "TranslateImage";
const TRANSLATE_IMAGE_VERSION = "2020-07-01";

/** 成功响应里火山常把 ResponseMetadata 置为 null，而非省略字段 */
const responseMetadataSchema = z
  .object({
    RequestId: z.string().optional(),
    Error: z
      .object({
        Code: z.string().optional(),
        CodeN: z.number().optional(),
        Message: z.string().optional(),
      })
      .optional(),
  })
  .nullish();

export const translateImageResponseSchema = z.object({
  Image: z.string().optional(),
  ResponseMetadata: responseMetadataSchema,
  /** 火山 SDK 部分成功响应使用 ResponseMetaData（大写 D） */
  ResponseMetaData: responseMetadataSchema,
});

export type VolcenginePictureTranslateFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
};

export type VolcenginePictureTranslateOk = { ok: true; bytes: Buffer };

function summarizeImageUrlForLog(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    return JSON.stringify({
      host: url.host,
      pathnameLength: url.pathname.length,
      hasQuery: Boolean(url.search),
    });
  } catch {
    return JSON.stringify({ host: "invalid-url" });
  }
}

function summarizeVolcRawResponse(raw: unknown): string {
  if (raw == null || typeof raw !== "object") {
    return JSON.stringify({ type: typeof raw });
  }

  const obj = raw as Record<string, unknown>;
  const image = obj.Image;
  const meta =
    (obj.ResponseMetadata as Record<string, unknown> | undefined) ??
    (obj.ResponseMetaData as Record<string, unknown> | undefined);
  const err = meta?.Error as Record<string, unknown> | undefined;

  return JSON.stringify({
    hasImageField: image != null,
    imageB64Length: typeof image === "string" ? image.length : 0,
    metadataKeys: Object.keys(obj).filter((k) => k.includes("Response")),
    requestId: typeof meta?.RequestId === "string" ? meta.RequestId : undefined,
    errorCode: typeof err?.Code === "string" ? err.Code : undefined,
    errorCodeN: typeof err?.CodeN === "number" ? err.CodeN : undefined,
    errorMessage:
      typeof err?.Message === "string" ? err.Message.slice(0, 240) : undefined,
  });
}

function extractVolcResponseError(
  data: z.infer<typeof translateImageResponseSchema>,
): { code: string; message: string; requestId?: string } | null {
  const meta = data.ResponseMetadata ?? data.ResponseMetaData;
  const err = meta?.Error;
  if (!err) return null;

  const hasSignal =
    err.Message != null || err.Code != null || err.CodeN != null;
  if (!hasSignal) return null;

  return {
    code: err.Code ?? String(err.CodeN ?? ""),
    message: err.Message ?? "",
    requestId: meta?.RequestId,
  };
}

/**
 * 下载源图字节；默认整段请求超时 10s（覆盖连接+读取，与「各约 5s」同量级）。
 */
export async function fetchSourceImageBytes(
  imageUrl: string,
): Promise<{ ok: true; bytes: Buffer } | VolcenginePictureTranslateFailure> {
  const connectMs = Number(
    process.env.PICTURE_TRANSLATE_IMAGE_FETCH_CONNECT_MS ?? 5000,
  );
  const readMs = Number(
    process.env.PICTURE_TRANSLATE_IMAGE_FETCH_READ_MS ?? 5000,
  );
  const deadlineMs = Math.max(1000, connectMs + readMs);

  console.info(
    `${LOG_PREFIX} fetch image start url=${summarizeImageUrlForLog(imageUrl)} deadlineMs=${deadlineMs}`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(imageUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.info(
        `${LOG_PREFIX} fetch image http error status=${res.status} elapsedMs=${Date.now() - startedAt} url=${summarizeImageUrlForLog(imageUrl)}`,
      );
      return {
        ok: false,
        reasonCode: "image_fetch_http_error",
        detail: String(res.status),
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    console.info(
      `${LOG_PREFIX} fetch image ok bytes=${buf.length} contentType=${res.headers.get("content-type") ?? "unknown"} elapsedMs=${Date.now() - startedAt}`,
    );
    return { ok: true, bytes: buf };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.info(
      `${LOG_PREFIX} fetch image failed reason=image_fetch_failed detail=${msg} elapsedMs=${Date.now() - startedAt} url=${summarizeImageUrlForLog(imageUrl)}`,
    );
    return { ok: false, reasonCode: "image_fetch_failed", detail: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 与 `HuoShanIntegration.huoShanImageTranslate` 等价：整图 Base64 入参、目标语言、返回译图字节。
 */
export async function volcengineTranslateImageToBytes(params: {
  imageBytes: Buffer;
  targetLanguage: string;
}): Promise<VolcenginePictureTranslateOk | VolcenginePictureTranslateFailure> {
  const cred = readVolcengineCredentials();
  if (!cred) {
    return { ok: false, reasonCode: "volc_credentials_missing" };
  }
  console.info(`${LOG_PREFIX} credentials loaded for translate`);

  const imageBytesLength = params.imageBytes.length;
  const base64Image = params.imageBytes.toString("base64");
  console.info(
    `${LOG_PREFIX} translate start targetLanguage=${params.targetLanguage} imageBytes=${imageBytesLength} base64Length=${base64Image.length}`,
  );

  const service = new Service({
    host: VOLCANO_TRANSLATE_HOST,
    serviceName: "translate",
    region: "cn-north-1",
    accessKeyId: cred.accessKeyId,
    secretKey: cred.secretKey,
  });

  const translateImage = service.createJSONAPI(TRANSLATE_IMAGE_ACTION, {
    Version: TRANSLATE_IMAGE_VERSION,
  });

  let raw: unknown;
  const apiStartedAt = Date.now();
  try {
    raw = await translateImage({
      Image: base64Image,
      TargetLanguage: params.targetLanguage,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} translate request threw reason=volc_request_failed elapsedMs=${Date.now() - apiStartedAt} detail=${detail}`,
    );
    return { ok: false, reasonCode: "volc_request_failed", detail };
  }

  console.info(
    `${LOG_PREFIX} translate response elapsedMs=${Date.now() - apiStartedAt} summary=${summarizeVolcRawResponse(raw)}`,
  );

  const parsed = translateImageResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      `${LOG_PREFIX} translate parse failed reason=volc_response_parse_failed zodIssues=${JSON.stringify(parsed.error.issues.map((i) => ({ path: i.path, message: i.message })))}`,
    );
    return { ok: false, reasonCode: "volc_response_parse_failed" };
  }

  const apiErr = extractVolcResponseError(parsed.data);
  if (apiErr) {
    const detail = `${apiErr.code}: ${apiErr.message}`.trim();
    console.info(
      `${LOG_PREFIX} translate api error reason=volc_api_error requestId=${apiErr.requestId ?? "n/a"} detail=${detail}`,
    );
    return {
      ok: false,
      reasonCode: "volc_api_error",
      detail,
    };
  }

  const imageB64 = parsed.data.Image;
  if (imageB64 == null || imageB64.length === 0) {
    console.info(
      `${LOG_PREFIX} translate empty image reason=volc_empty_image summary=${summarizeVolcRawResponse(raw)}`,
    );
    return { ok: false, reasonCode: "volc_empty_image" };
  }

  try {
    const bytes = Buffer.from(imageB64, "base64");
    console.info(
      `${LOG_PREFIX} translate ok outputBytes=${bytes.length} outputBase64Length=${imageB64.length}`,
    );
    return { ok: true, bytes };
  } catch {
    console.error(
      `${LOG_PREFIX} translate decode failed reason=volc_image_base64_decode_failed outputBase64Length=${imageB64.length}`,
    );
    return { ok: false, reasonCode: "volc_image_base64_decode_failed" };
  }
}
