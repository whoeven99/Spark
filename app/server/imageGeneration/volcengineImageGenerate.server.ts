import { Service } from "@volcengine/openapi";
import { z } from "zod";
import { readVolcengineCredentials } from "../volcengine/volcCredentials.server";
import {
  DEFAULT_IMAGE_GEN_HEIGHT,
  DEFAULT_IMAGE_GEN_WIDTH,
  DEFAULT_VOLC_IMAGE_GEN_REQ_KEY,
} from "./constants.server";

const LOG_PREFIX = "[ImageGeneration][Volc]";

const VOLC_VISUAL_HOST = "visual.volcengineapi.com";
const CV_PROCESS_ACTION = "CVProcess";
const CV_PROCESS_VERSION = "2022-08-31";

const cvProcessResponseSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z
    .object({
      binary_data_base64: z.array(z.string()).optional(),
      image_urls: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  /** 部分响应把 data 展平在顶层 */
  binary_data_base64: z.array(z.string()).optional(),
  image_urls: z.array(z.string()).optional(),
});

export type VolcImageGenerateFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
};

export type VolcImageGenerateOk = { ok: true; bytes: Buffer };

function resolveReqKey(): string {
  return (
    process.env.IMAGE_GEN_VOLC_REQ_KEY?.trim() || DEFAULT_VOLC_IMAGE_GEN_REQ_KEY
  );
}

function resolveDimensions(): { width: number; height: number } {
  const widthRaw = Number(process.env.IMAGE_GEN_WIDTH ?? DEFAULT_IMAGE_GEN_WIDTH);
  const heightRaw = Number(
    process.env.IMAGE_GEN_HEIGHT ?? DEFAULT_IMAGE_GEN_HEIGHT,
  );
  const width =
    Number.isFinite(widthRaw) && widthRaw >= 512 && widthRaw <= 2048
      ? Math.round(widthRaw)
      : DEFAULT_IMAGE_GEN_WIDTH;
  const height =
    Number.isFinite(heightRaw) && heightRaw >= 512 && heightRaw <= 2048
      ? Math.round(heightRaw)
      : DEFAULT_IMAGE_GEN_HEIGHT;
  return { width, height };
}

function extractImageBytesFromResponse(
  raw: z.infer<typeof cvProcessResponseSchema>,
): Buffer | null {
  const b64List =
    raw.data?.binary_data_base64 ?? raw.binary_data_base64 ?? undefined;
  if (b64List?.length) {
    const first = b64List[0]?.trim();
    if (first) {
      try {
        return Buffer.from(first, "base64");
      } catch {
        return null;
      }
    }
  }

  const urls = raw.data?.image_urls ?? raw.image_urls ?? undefined;
  if (urls?.length) {
    return null;
  }

  return null;
}

function extractImageUrlFromResponse(
  raw: z.infer<typeof cvProcessResponseSchema>,
): string | null {
  const urls = raw.data?.image_urls ?? raw.image_urls ?? undefined;
  const first = urls?.[0]?.trim();
  return first || null;
}

function summarizeVolcRawResponse(raw: unknown): string {
  if (raw == null || typeof raw !== "object") {
    return JSON.stringify({ type: typeof raw });
  }
  const obj = raw as Record<string, unknown>;
  const data = obj.data as Record<string, unknown> | undefined;
  const b64 = (data?.binary_data_base64 ?? obj.binary_data_base64) as
    | unknown[]
    | undefined;
  const urls = (data?.image_urls ?? obj.image_urls) as unknown[] | undefined;
  return JSON.stringify({
    code: obj.code,
    message:
      typeof obj.message === "string" ? obj.message.slice(0, 120) : undefined,
    requestId: obj.request_id,
    b64Count: Array.isArray(b64) ? b64.length : 0,
    firstB64Len:
      Array.isArray(b64) && typeof b64[0] === "string" ? b64[0].length : 0,
    urlCount: Array.isArray(urls) ? urls.length : 0,
  });
}

/**
 * 火山智能视觉 CVProcess 文生图（与整图翻译共用 HUOSHAN_* / VOLC_* 凭证）。
 */
export async function volcengineGenerateImageToBytes(params: {
  prompt: string;
}): Promise<VolcImageGenerateOk | VolcImageGenerateFailure> {
  const cred = readVolcengineCredentials();
  if (!cred) {
    return { ok: false, reasonCode: "volc_credentials_missing" };
  }

  const { width, height } = resolveDimensions();
  const reqKey = resolveReqKey();
  const promptLen = params.prompt.length;
  console.info(
    `${LOG_PREFIX} generate start reqKey=${reqKey} width=${width} height=${height} promptLen=${promptLen}`,
  );

  const service = new Service({
    host: VOLC_VISUAL_HOST,
    serviceName: "cv",
    region: "cn-north-1",
    accessKeyId: cred.accessKeyId,
    secretKey: cred.secretKey,
  });

  const cvProcess = service.createJSONAPI(CV_PROCESS_ACTION, {
    Version: CV_PROCESS_VERSION,
  });

  let raw: unknown;
  const apiStartedAt = Date.now();
  try {
    raw = await cvProcess({
      req_key: reqKey,
      prompt: params.prompt,
      width,
      height,
      return_url: true,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} request threw elapsedMs=${Date.now() - apiStartedAt} detail=${detail}`,
    );
    return { ok: false, reasonCode: "volc_request_failed", detail };
  }

  console.info(
    `${LOG_PREFIX} response elapsedMs=${Date.now() - apiStartedAt} summary=${summarizeVolcRawResponse(raw)}`,
  );

  const parsed = cvProcessResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reasonCode: "volc_response_parse_failed" };
  }

  if (parsed.data.code != null && parsed.data.code !== 10000) {
    const detail = `${parsed.data.code}: ${parsed.data.message ?? ""}`.trim();
    return { ok: false, reasonCode: "volc_api_error", detail };
  }

  const directUrl = extractImageUrlFromResponse(parsed.data);
  if (directUrl) {
    try {
      const res = await fetch(directUrl, { method: "GET", redirect: "follow" });
      if (!res.ok) {
        return {
          ok: false,
          reasonCode: "volc_image_fetch_failed",
          detail: String(res.status),
        };
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) {
        return { ok: false, reasonCode: "volc_empty_image" };
      }
      return { ok: true, bytes };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return { ok: false, reasonCode: "volc_image_fetch_failed", detail };
    }
  }

  const bytes = extractImageBytesFromResponse(parsed.data);
  if (!bytes || bytes.length === 0) {
    return { ok: false, reasonCode: "volc_empty_image" };
  }

  return { ok: true, bytes };
}
