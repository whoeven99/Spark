import { ses } from "tencentcloud-sdk-nodejs-ses";
import type { EmailConfig } from "../config/emailConfig.server";
import { loadEmailConfig } from "../config/emailConfig.server";
import { buildSendEmailRequestLog } from "../emailSendLogPayload.server";
import {
  EMAIL_LOG,
  logEmailDetail,
  logEmailError,
  logEmailInfo,
  maskEmailList,
} from "../emailLog.server";
import {
  createEmailError,
  EMAIL_ERROR_CODES,
} from "../types/emailError";
import type { SendEmailRequest } from "../types/sendEmailRequest";
import type { SendEmailResult } from "../types/sendEmailResult";
import { retryWithTimeout } from "../utils/retryWithTimeout.server";
import type { EmailProvider } from "./emailProvider";

const PROVIDER_NAME = "tencent";

type SesClient = InstanceType<typeof ses.v20201002.Client>;

let cachedClient: SesClient | null = null;
let cachedClientKey: string | null = null;

function buildClientKey(config: NonNullable<EmailConfig["tencent"]>): string {
  return `${config.secretId}:${config.region}`;
}

function getSesClient(config: NonNullable<EmailConfig["tencent"]>): SesClient {
  const key = buildClientKey(config);
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClient = new ses.v20201002.Client({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
  });
  cachedClientKey = key;
  logEmailInfo(EMAIL_LOG.tencent, `SesClient initialized region=${config.region}`);
  return cachedClient;
}

function serializeTemplateData(
  templateData: Record<string, string> | null | undefined,
): string {
  if (!templateData || Object.keys(templateData).length === 0) {
    return "{}";
  }
  return JSON.stringify(templateData);
}

function wrapSdkError(message: string, cause?: unknown): SendEmailResult {
  return {
    ok: false,
    error: createEmailError({
      code: EMAIL_ERROR_CODES.TENCENT_SEND_FAILED,
      message,
      provider: PROVIDER_NAME,
      cause,
    }),
  };
}

export function createTencentSesProvider(
  config: EmailConfig = loadEmailConfig(),
): EmailProvider {
  return {
    name: PROVIDER_NAME,
    async send(request: SendEmailRequest): Promise<SendEmailResult> {
      if (!config.tencent) {
        return wrapSdkError("Tencent SES credentials are not configured");
      }

      const tencent = config.tencent;
      const cc = request.cc?.length ? request.cc : tencent.cc;
      const templateDataJson = serializeTemplateData(request.templateData);

      const sendEmailParams = {
        FromEmailAddress: request.from,
        Subject: request.subject,
        Destination: [request.to],
        Cc: cc,
        Template: {
          TemplateID: request.templateId,
          TemplateData: templateDataJson,
        },
      };

      logEmailDetail(EMAIL_LOG.tencent, "before-sdk-call", {
        region: tencent.region,
        ...buildSendEmailRequestLog(request),
        sdkParams: {
          FromEmailAddress: request.from,
          Subject: request.subject,
          Destination: [request.to],
          Cc: maskEmailList(cc),
          Template: {
            TemplateID: request.templateId,
            TemplateData: templateDataJson,
          },
        },
      });

      try {
        const client = getSesClient(tencent);
        const sdkStartedAt = Date.now();
        const resp = await retryWithTimeout(
          () => client.SendEmail(sendEmailParams),
          {
            timeoutMs: config.sendTimeoutMs,
            maxRetries: config.maxRetries,
            onRetry: (error, attempt) => {
              logEmailError(
                EMAIL_LOG.tencent,
                `SendEmail retry attempt=${attempt}`,
                error,
                { templateId: request.templateId },
              );
            },
          },
        );

        const requestId = resp.RequestId?.trim();
        const messageId =
          typeof resp === "object" &&
          resp !== null &&
          "MessageId" in resp &&
          typeof (resp as { MessageId?: string }).MessageId === "string"
            ? (resp as { MessageId: string }).MessageId
            : undefined;

        logEmailDetail(EMAIL_LOG.tencent, "after-sdk-call", {
          sendSuccess: Boolean(requestId),
          requestId: requestId ?? null,
          messageId: messageId ?? null,
          templateId: request.templateId,
          elapsedMs: Date.now() - sdkStartedAt,
          responseKeys:
            typeof resp === "object" && resp !== null
              ? Object.keys(resp as object)
              : [],
        });

        if (!requestId) {
          return wrapSdkError(
            "Tencent SES response missing RequestId",
            resp,
          );
        }

        return { ok: true, requestId, provider: PROVIDER_NAME };
      } catch (error) {
        const tencentError =
          typeof error === "object" && error !== null
            ? {
                code:
                  "code" in error
                    ? String((error as { code?: unknown }).code)
                    : undefined,
                requestId:
                  "requestId" in error
                    ? String((error as { requestId?: unknown }).requestId)
                    : undefined,
              }
            : undefined;

        logEmailDetail(EMAIL_LOG.tencent, "after-sdk-call", {
          sendSuccess: false,
          templateId: request.templateId,
          tencentError,
        });
        logEmailError(
          EMAIL_LOG.error,
          "SendEmail failed",
          error,
          { templateId: request.templateId, to: request.to },
        );
        const message =
          error instanceof Error ? error.message : "Tencent SES send failed";
        return wrapSdkError(message, error);
      }
    },
  };
}

/** 测试用：重置单例 Client */
export function resetTencentSesClientForTests(): void {
  cachedClient = null;
  cachedClientKey = null;
}
