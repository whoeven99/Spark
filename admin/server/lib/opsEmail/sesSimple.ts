import { ses } from "tencentcloud-sdk-nodejs-ses";
import { getEnv } from "../env.js";
import { maskEmail } from "./maskEmail.js";

const LOG = "[ops-email/send]";
const DEFAULT_FROM = "support@msg.ciwi.ai";
const DEFAULT_REGION = "ap-hongkong";

type SesClient = InstanceType<typeof ses.v20201002.Client>;

let cachedClient: SesClient | null = null;
let cachedKey: string | null = null;

export type SesSendMode = "template" | "simple";

export type SesErrorDetail = {
  message: string;
  code: string | null;
  requestId: string | null;
};

export type SesSimpleResult =
  | { ok: true; requestId: string }
  | { ok: false; message: string; code?: string | null; requestId?: string | null };

export type OpsEmailSesLogContext = {
  shop: string;
  templateKey: string;
  templateId: number;
  templateData?: Record<string, string>;
  htmlLength?: number;
};

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function resolveFromEmail(): string {
  const candidate = getEnv("TENCENT_FROM_EMAIL") || DEFAULT_FROM;
  if (candidate.toLowerCase() === "support@ciwi.ai") return DEFAULT_FROM;
  return candidate;
}

function getClient(): SesClient {
  const secretId = getEnv("TENCENT_CLOUD_KEY_ID") || getEnv("Tencent_Cloud_KEY_ID");
  const secretKey = getEnv("TENCENT_CLOUD_KEY") || getEnv("Tencent_Cloud_KEY");
  const region = getEnv("TENCENT_SES_REGION") || DEFAULT_REGION;
  if (!secretId || !secretKey) {
    throw new Error("未配置 TENCENT_CLOUD_KEY_ID / TENCENT_CLOUD_KEY");
  }
  const key = `${secretId}:${region}`;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new ses.v20201002.Client({
    credential: { secretId, secretKey },
    region,
  });
  cachedKey = key;
  return cachedClient;
}

export function isOpsEmailSendReady(): boolean {
  const enabled = (getEnv("EMAIL_ENABLED") || "true").toLowerCase();
  if (enabled === "false" || enabled === "0") return false;
  const secretId = getEnv("TENCENT_CLOUD_KEY_ID") || getEnv("Tencent_Cloud_KEY_ID");
  const secretKey = getEnv("TENCENT_CLOUD_KEY") || getEnv("Tencent_Cloud_KEY");
  return Boolean(secretId && secretKey);
}

export function resolveTestRecipient(): string | null {
  return getEnv("EMAIL_TEST_RECIPIENT") || null;
}

export function describeSesError(error: unknown): SesErrorDetail {
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    const code = pickString(rec.code) ?? pickString(rec.Code);
    const requestId = pickString(rec.requestId) ?? pickString(rec.RequestId);
    const message =
      pickString(rec.message) ??
      pickString(rec.Message) ??
      (error instanceof Error ? error.message.trim() : "") ??
      "";
    return {
      message: message || "腾讯云 SES 发送失败",
      code,
      requestId,
    };
  }
  if (typeof error === "string" && error.trim()) {
    return { message: error.trim(), code: null, requestId: null };
  }
  return { message: "腾讯云 SES 发送失败", code: null, requestId: null };
}

export function formatSesFailureMessage(
  detail: SesErrorDetail,
  extras: { mode: SesSendMode; templateId: number },
): string {
  const parts = [detail.message || "腾讯云 SES 发送失败"];
  if (detail.code) parts.push(`code=${detail.code}`);
  if (detail.requestId) parts.push(`requestId=${detail.requestId}`);
  parts.push(`mode=${extras.mode}`);
  if (extras.templateId > 0) parts.push(`templateId=${extras.templateId}`);
  return parts.join(" | ");
}

export function redactOpsEmailParams(
  params: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (/email/i.test(key) || /@[^@\s]+\.[^@\s]+/.test(value)) {
      next[key] = maskEmail(value) ?? "***";
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function logOpsEmailSendFailure(input: {
  shop: string;
  toMasked: string | null;
  mode: SesSendMode;
  templateKey: string;
  templateId: number;
  subject: string;
  from: string;
  elapsedMs: number;
  templateData?: Record<string, string>;
  htmlLength?: number;
  error: unknown;
}): void {
  const detail = describeSesError(input.error);
  console.error(`${LOG} failed`, {
    shop: input.shop,
    to: input.toMasked,
    from: input.from,
    mode: input.mode,
    templateKey: input.templateKey,
    templateId: input.templateId,
    subject: input.subject,
    region: getEnv("TENCENT_SES_REGION") || DEFAULT_REGION,
    elapsedMs: input.elapsedMs,
    sesCode: detail.code,
    sesMessage: detail.message,
    sesRequestId: detail.requestId,
    templateData: input.templateData
      ? redactOpsEmailParams(input.templateData)
      : undefined,
    htmlLength: input.htmlLength,
  }, input.error);
}

function failResult(
  error: unknown,
  extras: {
    mode: SesSendMode;
    to: string;
    subject: string;
    context: OpsEmailSesLogContext;
    startedAt: number;
    htmlLength?: number;
  },
): SesSimpleResult {
  const from = resolveFromEmail();
  const detail = describeSesError(error);
  logOpsEmailSendFailure({
    shop: extras.context.shop,
    toMasked: maskEmail(extras.to),
    mode: extras.mode,
    templateKey: extras.context.templateKey,
    templateId: extras.context.templateId,
    subject: extras.subject,
    from,
    elapsedMs: Date.now() - extras.startedAt,
    templateData: extras.context.templateData,
    htmlLength: extras.htmlLength,
    error,
  });
  return {
    ok: false,
    message: formatSesFailureMessage(detail, {
      mode: extras.mode,
      templateId: extras.context.templateId,
    }),
    code: detail.code,
    requestId: detail.requestId,
  };
}

function stringifyTemplateData(data: Record<string, string>): string {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    next[key] = value == null ? "" : String(value);
  }
  return JSON.stringify(next);
}

export async function sendTemplateEmail(input: {
  to: string;
  subject: string;
  templateId: number;
  templateData: Record<string, string>;
  context: OpsEmailSesLogContext;
}): Promise<SesSimpleResult> {
  const startedAt = Date.now();
  if (!isOpsEmailSendReady()) {
    return failResult(new Error("邮件未启用或缺少腾讯云 SES 凭证"), {
      mode: "template",
      to: input.to,
      subject: input.subject,
      context: input.context,
      startedAt,
    });
  }
  if (!Number.isInteger(input.templateId) || input.templateId <= 0) {
    return failResult(new Error(`无效的腾讯云模板 ID：${input.templateId}`), {
      mode: "template",
      to: input.to,
      subject: input.subject,
      context: input.context,
      startedAt,
    });
  }

  try {
    const resp = await getClient().SendEmail({
      FromEmailAddress: resolveFromEmail(),
      Destination: [input.to],
      Subject: input.subject,
      Template: {
        TemplateID: input.templateId,
        TemplateData: stringifyTemplateData(input.templateData),
      },
    });
    const requestId = resp.RequestId?.trim();
    if (!requestId) {
      return failResult(new Error("腾讯云 SES 未返回 RequestId"), {
        mode: "template",
        to: input.to,
        subject: input.subject,
        context: input.context,
        startedAt,
      });
    }
    console.info(`${LOG} sent`, {
      shop: input.context.shop,
      to: maskEmail(input.to),
      mode: "template",
      templateKey: input.context.templateKey,
      templateId: input.templateId,
      requestId,
      elapsedMs: Date.now() - startedAt,
    });
    return { ok: true, requestId };
  } catch (error) {
    return failResult(error, {
      mode: "template",
      to: input.to,
      subject: input.subject,
      context: input.context,
      startedAt,
    });
  }
}

export async function sendSimpleEmail(input: {
  to: string;
  subject: string;
  html: string;
  context: OpsEmailSesLogContext;
}): Promise<SesSimpleResult> {
  const startedAt = Date.now();
  const htmlLength = input.html.length;
  if (!isOpsEmailSendReady()) {
    return failResult(new Error("邮件未启用或缺少腾讯云 SES 凭证"), {
      mode: "simple",
      to: input.to,
      subject: input.subject,
      context: input.context,
      startedAt,
      htmlLength,
    });
  }

  const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  try {
    const resp = await getClient().SendEmail({
      FromEmailAddress: resolveFromEmail(),
      Destination: [input.to],
      Subject: input.subject,
      Simple: {
        Html: encodeBase64(input.html),
        Text: encodeBase64(text || input.subject),
      },
    });
    const requestId = resp.RequestId?.trim();
    if (!requestId) {
      return failResult(new Error("腾讯云 SES 未返回 RequestId"), {
        mode: "simple",
        to: input.to,
        subject: input.subject,
        context: input.context,
        startedAt,
        htmlLength,
      });
    }
    console.info(`${LOG} sent`, {
      shop: input.context.shop,
      to: maskEmail(input.to),
      mode: "simple",
      templateKey: input.context.templateKey,
      requestId,
      elapsedMs: Date.now() - startedAt,
      htmlLength,
    });
    return { ok: true, requestId };
  } catch (error) {
    return failResult(error, {
      mode: "simple",
      to: input.to,
      subject: input.subject,
      context: input.context,
      startedAt,
      htmlLength,
    });
  }
}
