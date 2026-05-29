import { Service } from "@volcengine/openapi";
import { readVolcengineCredentials } from "../volcengine/volcCredentials.server";
import {
  DEFAULT_IMAGE_GEN_HEIGHT,
  DEFAULT_IMAGE_GEN_WIDTH,
  DEFAULT_VOLC_IMAGE_GEN_REQ_KEY,
} from "./constants.server";

const LOG_PREFIX = "[ImageGeneration][Volc]";

const VOLC_VISUAL_HOST = "visual.volcengineapi.com";
const CV_PROCESS_ACTION = "CVProcess";
const CV_SYNC_SUBMIT_ACTION = "CVSync2AsyncSubmitTask";
const CV_SYNC_GET_RESULT_ACTION = "CVSync2AsyncGetResult";
const CV_API_VERSION = "2022-08-31";

const VOLC_SUCCESS_CODE = 10000;

const ASYNC_POLL_INTERVAL_MS = 2000;
const ASYNC_POLL_MAX_ATTEMPTS = 30;

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

function resolveVolcMode(): "async" | "sync" {
  const raw = process.env.IMAGE_GEN_VOLC_MODE?.trim().toLowerCase();
  if (raw === "sync") return "sync";
  return "async";
}

function createVisualService(cred: { accessKeyId: string; secretKey: string }) {
  return new Service({
    host: VOLC_VISUAL_HOST,
    serviceName: "cv",
    region: "cn-north-1",
    accessKeyId: cred.accessKeyId,
    secretKey: cred.secretKey,
  });
}

function coerceVolcPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
}

function getVolcCode(payload: Record<string, unknown>): number | null {
  const code = payload.code ?? payload.status;
  if (typeof code === "number" && Number.isFinite(code)) return code;
  if (typeof code === "string" && /^\d+$/.test(code.trim())) {
    return Number(code.trim());
  }
  return null;
}

function getVolcMessage(payload: Record<string, unknown>): string {
  const msg = payload.message ?? payload.Message;
  return typeof msg === "string" ? msg.trim() : "";
}

function unwrapVolcData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data ?? payload.Data ?? payload.result ?? payload.Result;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return payload;
}

function extractB64List(data: Record<string, unknown>): string[] {
  const raw =
    data.binary_data_base64 ??
    data.BinaryDataBase64 ??
    data.binary_data ??
    data.image;

  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  return [];
}

function extractUrlList(data: Record<string, unknown>): string[] {
  const raw = data.image_urls ?? data.ImageUrls ?? data.image_url ?? data.url;
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  return [];
}

function extractTaskId(data: Record<string, unknown>): string {
  const raw = data.task_id ?? data.taskId ?? data.TaskId;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractAsyncStatus(data: Record<string, unknown>): string {
  const raw = data.status ?? data.Status ?? data.task_status ?? data.taskStatus;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function summarizeVolcRawResponse(raw: unknown): string {
  const payload = coerceVolcPayload(raw);
  if (!payload) {
    return JSON.stringify({ type: typeof raw });
  }
  const data = unwrapVolcData(payload);
  return JSON.stringify({
    code: getVolcCode(payload),
    message: getVolcMessage(payload).slice(0, 160),
    requestId: payload.request_id ?? payload.requestId,
    dataKeys: Object.keys(data).slice(0, 12),
    taskId: extractTaskId(data) || undefined,
    asyncStatus: extractAsyncStatus(data) || undefined,
    b64Count: extractB64List(data).length,
    urlCount: extractUrlList(data).length,
  });
}

function checkVolcApiError(
  payload: Record<string, unknown>,
): VolcImageGenerateFailure | null {
  const code = getVolcCode(payload);
  if (code != null && code !== VOLC_SUCCESS_CODE) {
    const detail = `${code}: ${getVolcMessage(payload)}`.trim();
    return { ok: false, reasonCode: "volc_api_error", detail };
  }
  return null;
}

async function fetchImageBytesFromUrl(
  url: string,
): Promise<VolcImageGenerateOk | VolcImageGenerateFailure> {
  const deadlineMs = 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
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
  } finally {
    clearTimeout(timer);
  }
}

async function bytesFromVolcData(
  data: Record<string, unknown>,
): Promise<VolcImageGenerateOk | VolcImageGenerateFailure> {
  const urls = extractUrlList(data);
  if (urls.length > 0) {
    return fetchImageBytesFromUrl(urls[0]!);
  }

  const b64List = extractB64List(data);
  if (b64List.length > 0) {
    try {
      const bytes = Buffer.from(b64List[0]!, "base64");
      if (bytes.length === 0) {
        return { ok: false, reasonCode: "volc_empty_image" };
      }
      return { ok: true, bytes };
    } catch {
      return { ok: false, reasonCode: "volc_image_base64_decode_failed" };
    }
  }

  return { ok: false, reasonCode: "volc_empty_image" };
}

function parseVolcResponse(
  raw: unknown,
): { ok: true; payload: Record<string, unknown>; data: Record<string, unknown> } | VolcImageGenerateFailure {
  const payload = coerceVolcPayload(raw);
  if (!payload) {
    return {
      ok: false,
      reasonCode: "volc_response_parse_failed",
      detail: "response not object",
    };
  }

  const apiErr = checkVolcApiError(payload);
  if (apiErr) return apiErr;

  const data = unwrapVolcData(payload);
  return { ok: true, payload, data };
}

async function volcengineGenerateImageSync(params: {
  prompt: string;
  reqKey: string;
  width: number;
  height: number;
  service: Service;
}): Promise<VolcImageGenerateOk | VolcImageGenerateFailure> {
  const cvProcess = params.service.createJSONAPI(CV_PROCESS_ACTION, {
    Version: CV_API_VERSION,
  });

  let raw: unknown;
  const apiStartedAt = Date.now();
  try {
    raw = await cvProcess({
      req_key: params.reqKey,
      prompt: params.prompt,
      width: params.width,
      height: params.height,
      return_url: true,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} CVProcess threw elapsedMs=${Date.now() - apiStartedAt} detail=${detail}`,
    );
    return { ok: false, reasonCode: "volc_request_failed", detail };
  }

  console.info(
    `${LOG_PREFIX} CVProcess response elapsedMs=${Date.now() - apiStartedAt} summary=${summarizeVolcRawResponse(raw)}`,
  );

  const parsed = parseVolcResponse(raw);
  if (!parsed.ok) return parsed;

  return bytesFromVolcData(parsed.data);
}

async function volcengineGenerateImageAsync(params: {
  prompt: string;
  reqKey: string;
  width: number;
  height: number;
  service: Service;
}): Promise<VolcImageGenerateOk | VolcImageGenerateFailure> {
  const submitApi = params.service.createJSONAPI(CV_SYNC_SUBMIT_ACTION, {
    Version: CV_API_VERSION,
  });
  const getResultApi = params.service.createJSONAPI(CV_SYNC_GET_RESULT_ACTION, {
    Version: CV_API_VERSION,
  });

  const submitBody: Record<string, unknown> = {
    req_key: params.reqKey,
    positive_prompt: params.prompt,
    width: params.width,
    height: params.height,
    return_url: true,
  };

  const scheduleConf = process.env.IMAGE_GEN_VOLC_SCHEDULE_CONF?.trim();
  if (scheduleConf) {
    submitBody.schedule_conf = scheduleConf;
  }

  let submitRaw: unknown;
  const submitStartedAt = Date.now();
  try {
    submitRaw = await submitApi(submitBody);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} CVSync2AsyncSubmitTask threw elapsedMs=${Date.now() - submitStartedAt} detail=${detail}`,
    );
    return { ok: false, reasonCode: "volc_request_failed", detail };
  }

  console.info(
    `${LOG_PREFIX} submit response elapsedMs=${Date.now() - submitStartedAt} summary=${summarizeVolcRawResponse(submitRaw)}`,
  );

  const submitParsed = parseVolcResponse(submitRaw);
  if (!submitParsed.ok) return submitParsed;

  const taskId = extractTaskId(submitParsed.data);
  if (!taskId) {
    const inlineImage = await bytesFromVolcData(submitParsed.data);
    if (inlineImage.ok) return inlineImage;
    return {
      ok: false,
      reasonCode: "volc_response_parse_failed",
      detail: "submit ok but missing task_id",
    };
  }

  for (let attempt = 1; attempt <= ASYNC_POLL_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_POLL_INTERVAL_MS));
    }

    let pollRaw: unknown;
    try {
      pollRaw = await getResultApi({
        req_key: params.reqKey,
        task_id: taskId,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(
        `${LOG_PREFIX} CVSync2AsyncGetResult threw attempt=${attempt} taskId=${taskId} detail=${detail}`,
      );
      return { ok: false, reasonCode: "volc_request_failed", detail };
    }

    const pollParsed = parseVolcResponse(pollRaw);
    if (!pollParsed.ok) return pollParsed;

    const status = extractAsyncStatus(pollParsed.data);
    console.info(
      `${LOG_PREFIX} poll attempt=${attempt}/${ASYNC_POLL_MAX_ATTEMPTS} taskId=${taskId} status=${status || "unknown"} summary=${summarizeVolcRawResponse(pollRaw)}`,
    );

    if (status === "failed" || status === "error" || status === "expired") {
      const detail =
        getVolcMessage(pollParsed.payload) ||
        getVolcMessage(pollParsed.data) ||
        status;
      return { ok: false, reasonCode: "volc_api_error", detail };
    }

    const imageResult = await bytesFromVolcData(pollParsed.data);
    if (imageResult.ok) {
      return imageResult;
    }

    const doneStatuses = new Set(["done", "success", "succeed", "finished", "complete"]);
    if (doneStatuses.has(status)) {
      return imageResult;
    }

    if (
      imageResult.reasonCode === "volc_empty_image" &&
      (status === "" || status === "generating" || status === "in_queue" || status === "processing")
    ) {
      continue;
    }

    if (status && !doneStatuses.has(status)) {
      continue;
    }
  }

  return {
    ok: false,
    reasonCode: "volc_request_failed",
    detail: `async task timeout after ${(ASYNC_POLL_MAX_ATTEMPTS * ASYNC_POLL_INTERVAL_MS) / 1000}s`,
  };
}

/**
 * 火山智能视觉文生图（与整图翻译共用 HUOSHAN_* / VOLC_* 凭证）。
 * 默认走 CVSync2AsyncSubmitTask + CVSync2AsyncGetResult（high_aes 系列）；IMAGE_GEN_VOLC_MODE=sync 时用 CVProcess。
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
  const mode = resolveVolcMode();
  const promptLen = params.prompt.length;
  console.info(
    `${LOG_PREFIX} generate start mode=${mode} reqKey=${reqKey} width=${width} height=${height} promptLen=${promptLen}`,
  );

  const service = createVisualService(cred);

  if (mode === "sync") {
    return volcengineGenerateImageSync({
      prompt: params.prompt,
      reqKey,
      width,
      height,
      service,
    });
  }

  const asyncResult = await volcengineGenerateImageAsync({
    prompt: params.prompt,
    reqKey,
    width,
    height,
    service,
  });

  if (asyncResult.ok) {
    return asyncResult;
  }

  if (process.env.IMAGE_GEN_VOLC_SYNC_FALLBACK === "true") {
    console.info(
      `${LOG_PREFIX} async failed reason=${asyncResult.reasonCode}, trying CVProcess fallback`,
    );
    return volcengineGenerateImageSync({
      prompt: params.prompt,
      reqKey,
      width,
      height,
      service,
    });
  }

  return asyncResult;
}
