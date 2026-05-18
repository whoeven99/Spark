import { Service } from "@volcengine/openapi";
import { z } from "zod";

const VOLCANO_TRANSLATE_HOST = "translate.volcengineapi.com";
const TRANSLATE_IMAGE_ACTION = "TranslateImage";
const TRANSLATE_IMAGE_VERSION = "2020-07-01";

const responseMetadataSchema = z
  .object({
    Error: z
      .object({
        Code: z.string().optional(),
        CodeN: z.number().optional(),
        Message: z.string().optional(),
      })
      .optional(),
  })
  .optional();

const translateImageResponseSchema = z.object({
  Image: z.string().optional(),
  ResponseMetadata: responseMetadataSchema,
});

export type VolcenginePictureTranslateFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
};

export type VolcenginePictureTranslateOk = { ok: true; bytes: Buffer };

function readVolcengineCredentials():
  | { accessKeyId: string; secretKey: string }
  | null {
  const accessKeyId =
    process.env.HUOSHAN_API_KEY?.trim() ||
    process.env.VOLC_ACCESSKEY?.trim() ||
    "";
  const secretKey =
    process.env.HUOSHAN_API_SECRET?.trim() ||
    process.env.VOLC_SECRETKEY?.trim() ||
    "";
  if (!accessKeyId || !secretKey) return null;
  return { accessKeyId, secretKey };
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const res = await fetch(imageUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reasonCode: "image_fetch_http_error",
        detail: String(res.status),
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, bytes: buf };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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

  const base64Image = params.imageBytes.toString("base64");
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
  try {
    raw = await translateImage({
      Image: base64Image,
      TargetLanguage: params.targetLanguage,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reasonCode: "volc_request_failed", detail };
  }

  const parsed = translateImageResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reasonCode: "volc_response_parse_failed" };
  }

  const metaErr = parsed.data.ResponseMetadata?.Error;
  if (
    metaErr &&
    (metaErr.Message != null ||
      metaErr.Code != null ||
      metaErr.CodeN != null)
  ) {
    const code = metaErr.Code ?? String(metaErr.CodeN ?? "");
    return {
      ok: false,
      reasonCode: "volc_api_error",
      detail: `${code}: ${metaErr.Message ?? ""}`.trim(),
    };
  }

  const imageB64 = parsed.data.Image;
  if (imageB64 == null || imageB64.length === 0) {
    return { ok: false, reasonCode: "volc_empty_image" };
  }

  try {
    const bytes = Buffer.from(imageB64, "base64");
    return { ok: true, bytes };
  } catch {
    return { ok: false, reasonCode: "volc_image_base64_decode_failed" };
  }
}
