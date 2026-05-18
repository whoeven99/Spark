import { z } from "zod";
import {
  executeAidgeIopRequest,
  readAidgeIopCredentials,
  resolveAidgeImageTranslateApiPath,
} from "./aidgeIopRequest.server";

const LOG_TRANSLATE = "[AidgeTranslate]";
const LOG_RESPONSE = "[AidgeResponse]";
const LOG_ERROR = "[AidgeError]";

const aidgeImageTranslationBodySchema = z
  .object({
    type: z.string().optional(),
    success: z.boolean().optional(),
    resCode: z.number().optional(),
    code: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
    resMessage: z.string().optional(),
    errorMsg: z.string().optional(),
    requestId: z.string().optional(),
    request_id: z.string().optional(),
    data: z.unknown().optional(),
    result: z.unknown().optional(),
    imageUrl: z.string().optional(),
    translatedImageUrl: z.string().optional(),
  })
  .passthrough();

const dataObjectSchema = z
  .object({
    imageUrl: z.string().optional(),
    translatedImageUrl: z.string().optional(),
    resultUrl: z.string().optional(),
    url: z.string().optional(),
    image: z.string().optional(),
  })
  .passthrough();

export type AidgePictureTranslateFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
};

export type AidgePictureTranslateOk = {
  ok: true;
  /** 译图 HTTPS URL（来自 Aidge 响应） */
  translatedImageUrl: string;
  requestId?: string;
};

function collectUrlCandidatesFromObject(
  candidates: string[],
  value: unknown,
): void {
  const push = (v: string | undefined) => {
    if (v?.trim()) candidates.push(v.trim());
  };
  const parsed = dataObjectSchema.safeParse(value);
  if (!parsed.success) return;
  push(parsed.data.translatedImageUrl);
  push(parsed.data.resultUrl);
  push(parsed.data.imageUrl);
  push(parsed.data.url);
  push(parsed.data.image);
}

/** IOP 网关层 code：`0` 表示调用成功（与业务 resCode 200 并存）。 */
export function isAidgeIopGatewaySuccessCode(code: unknown): boolean {
  if (code == null) return true;
  const normalized = String(code);
  return normalized === "0" || normalized === "200";
}

export function isAidgeBusinessSuccess(body: unknown): boolean {
  const parsed = aidgeImageTranslationBodySchema.safeParse(body);
  if (!parsed.success) return false;

  const d = parsed.data;
  if (d.success === false) return false;
  if (d.resCode != null && d.resCode !== 200) return false;

  // IOP 错误包：{ type: "ISV", code: "MissingParameter", message: "..." }
  if (d.type?.trim() && d.success !== true && d.resCode == null) {
    return false;
  }

  if (d.code != null && !isAidgeIopGatewaySuccessCode(d.code)) {
    return false;
  }

  if (d.success === true || d.resCode === 200) return true;
  if (isAidgeIopGatewaySuccessCode(d.code) && extractTranslatedImageUrl(body)) {
    return true;
  }

  return false;
}

export function extractTranslatedImageUrl(body: unknown): string | null {
  const top = aidgeImageTranslationBodySchema.safeParse(body);
  if (!top.success) return null;

  const candidates: string[] = [];
  const push = (v: string | undefined) => {
    if (v?.trim()) candidates.push(v.trim());
  };

  push(top.data.translatedImageUrl);
  push(top.data.imageUrl);
  collectUrlCandidatesFromObject(candidates, top.data.data);
  collectUrlCandidatesFromObject(candidates, top.data.result);

  if (Array.isArray(top.data.data)) {
    for (const item of top.data.data) {
      collectUrlCandidatesFromObject(candidates, item);
    }
  }

  const https = candidates.find((u) => /^https:\/\//i.test(u));
  return https ?? candidates[0] ?? null;
}

function safeUrlHostForLog(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

/** 日志用：脱敏响应摘要（不打印完整图片 URL）。 */
export function summarizeAidgeResponseForLog(body: unknown): string {
  const parsed = aidgeImageTranslationBodySchema.safeParse(body);
  if (!parsed.success) {
    const preview =
      typeof body === "string"
        ? body.slice(0, 200)
        : JSON.stringify(body)?.slice(0, 200);
    return `unparsed preview=${preview ?? "empty"}`;
  }

  const d = parsed.data;
  const translatedUrl = extractTranslatedImageUrl(body);
  const parts = [
    `type=${d.type ?? "-"}`,
    `success=${String(d.success ?? "-")}`,
    `resCode=${String(d.resCode ?? "-")}`,
    `code=${String(d.code ?? "-")}`,
    `hasTranslatedUrl=${String(Boolean(translatedUrl))}`,
  ];
  if (translatedUrl) {
    parts.push(`translatedHost=${safeUrlHostForLog(translatedUrl)}`);
  }
  const msg = d.resMessage?.trim() || d.errorMsg?.trim() || d.message?.trim();
  if (msg) parts.push(`message=${msg.slice(0, 120)}`);
  const reqId = d.requestId ?? d.request_id;
  if (reqId) parts.push(`requestId=${reqId}`);

  if (d.data != null && typeof d.data === "object") {
    const keys =
      Array.isArray(d.data)
        ? [`arrayLen=${d.data.length}`]
        : Object.keys(d.data as Record<string, unknown>).slice(0, 8);
    parts.push(`dataKeys=${keys.join(",")}`);
  }

  return parts.join(" ");
}

export function extractAidgeErrorDetail(body: unknown): string | undefined {
  const parsed = aidgeImageTranslationBodySchema.safeParse(body);
  if (!parsed.success) return undefined;

  const d = parsed.data;
  const message =
    d.errorMsg?.trim() ||
    d.resMessage?.trim() ||
    d.message?.trim() ||
    undefined;

  if (message) return message;

  if (d.type?.trim() && d.code != null && !isAidgeIopGatewaySuccessCode(d.code)) {
    return `${d.type}:${String(d.code)}`;
  }

  if (d.resCode != null && d.resCode !== 200) {
    return `resCode=${d.resCode}`;
  }

  if (d.code != null && !isAidgeIopGatewaySuccessCode(d.code)) {
    return `code=${String(d.code)}`;
  }

  return undefined;
}

/**
 * Aidge 标准版整图翻译：`POST /ai/image/translation`（IOP 签名）。
 * 需要公网可访问的 HTTPS `imageUrl`。
 */
export async function aidgeTranslateImageByUrl(params: {
  imageUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatingTextInTheProduct?: boolean;
}): Promise<AidgePictureTranslateOk | AidgePictureTranslateFailure> {
  const cred = readAidgeIopCredentials();
  if (!cred) {
    return { ok: false, reasonCode: "aidge_credentials_missing" };
  }

  const apiName = resolveAidgeImageTranslateApiPath();
  const businessParams: Record<string, string> = {
    imageUrl: params.imageUrl.trim(),
    sourceLanguage: params.sourceLanguage.trim(),
    targetLanguage: params.targetLanguage.trim(),
    translatingTextInTheProduct: String(
      params.translatingTextInTheProduct ?? false,
    ),
  };

  console.info(
    `${LOG_TRANSLATE} start target=${businessParams.targetLanguage} source=${businessParams.sourceLanguage} imageHost=${safeUrlHost(businessParams.imageUrl)}`,
  );

  const response = await executeAidgeIopRequest({
    apiName,
    businessParams,
    credentials: cred,
  });

  if (!response.ok) {
    return {
      ok: false,
      reasonCode: response.reasonCode,
      detail: response.detail,
    };
  }

  const businessSuccess = isAidgeBusinessSuccess(response.body);
  console.info(
    `${LOG_RESPONSE} elapsedMs=${response.elapsedMs} businessSuccess=${String(businessSuccess)} ${summarizeAidgeResponseForLog(response.body)}`,
  );

  if (!businessSuccess) {
    const detail = extractAidgeErrorDetail(response.body);
    console.info(
      `${LOG_ERROR} business error detail=${detail ?? "unknown"} ${summarizeAidgeResponseForLog(response.body)}`,
    );
    return {
      ok: false,
      reasonCode: "aidge_api_error",
      detail,
    };
  }

  const translatedImageUrl = extractTranslatedImageUrl(response.body);
  if (!translatedImageUrl) {
    console.info(`${LOG_ERROR} empty translated image url in response`);
    return { ok: false, reasonCode: "aidge_empty_image" };
  }

  const parsed = aidgeImageTranslationBodySchema.safeParse(response.body);
  return {
    ok: true,
    translatedImageUrl,
    requestId: parsed.success ? parsed.data.requestId : undefined,
  };
}

function safeUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}
