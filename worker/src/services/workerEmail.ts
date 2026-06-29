/**
 * worker 专用 Tencent SES 邮件发送服务。
 * worker 进程独立运行，不能 import app/ 代码，因此此处直接调用腾讯云 SDK。
 *
 * 三个业务场景（对齐 Spring TencentEmailService）：
 *   - sendManualTranslationSuccessEmail  手动翻译成功（模板 137353）
 *   - sendAutoTranslationSuccessEmail    自动翻译成功（模板 140352）
 *   - sendTranslationPartialEmail        翻译部分完成/额度暂停（模板 159297）
 */

import { ses } from "tencentcloud-sdk-nodejs-ses";
import { getTsfRemainingForEmail } from "./tsfQuota.js";

const LOG = "[workerEmail]";

/** 日志中脱敏邮箱，保留域名与本地部分前 2 字符便于排查。 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "(invalid)";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function logDetail(phase: string, payload: Record<string, unknown>): void {
  console.info(`${LOG} ${phase} ${JSON.stringify(payload)}`);
}

// ─── 模板 ID（对齐 Spring MailChimpConstants + Spark emailTemplates.server.ts）───
const TEMPLATE_MANUAL_SUCCESS = 137353;
const TEMPLATE_AUTO_SUCCESS = 140352;
const TEMPLATE_PARTIAL = 159297;

// ─── 邮件主题（对齐 Spring MailChimpConstants）───────────────────────────────────
const SUBJECT_MANUAL_SUCCESS = "Your Translation Has Been Completed";
const SUBJECT_AUTO_SUCCESS = "Your Auto-Translation Has Been Completed";
const SUBJECT_PARTIAL = "Your Translation Has Been Partially Completed";

type SesClientInstance = InstanceType<typeof ses.v20201002.Client>;

let _client: SesClientInstance | null = null;

const FROM_EMAIL =
  process.env.TENCENT_FROM_EMAIL?.trim() || "support@msg.ciwi.ai";

/** 对齐 Java MailChimpConstants.CC_EMAIL_ARRAY / Spark emailConfig DEFAULT_CC */
const V4_EMAIL_CC = ["feynman@ciwi.ai", "yewen@ciwi.ai"] as const;

function getSesClient(): SesClientInstance | null {
  if (_client) return _client;
  const secretId = process.env.TENCENT_CLOUD_KEY_ID?.trim();
  const secretKey = process.env.TENCENT_CLOUD_KEY?.trim();
  if (!secretId || !secretKey) {
    logDetail("ses-client-missing", {
      hasSecretId: Boolean(secretId),
      hasSecretKey: Boolean(secretKey),
    });
    return null;
  }
  const region = process.env.TENCENT_SES_REGION?.trim() || "ap-hongkong";
  _client = new ses.v20201002.Client({
    credential: { secretId, secretKey },
    region,
  });
  logDetail("ses-client-initialized", { region, from: maskEmail(FROM_EMAIL) });
  return _client;
}

/** 去掉 .myshopify.com 后缀，得到可读店名。 */
function parseShopName(shopName: string): string {
  return shopName.replace(/\.myshopify\.com$/, "");
}

/** 数字格式化为千分位（对齐 Java NumberFormat.getNumberInstance(Locale.US)）。 */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** 对齐 Java TencentEmailService.sendSuccessEmail：查不到额度时保留占位符。 */
function formatRemainingCredits(remaining: number | null): string {
  if (remaining == null) return "—";
  return formatNumber(remaining < 0 ? 0 : remaining);
}

async function doSend(
  templateId: number,
  subject: string,
  templateData: Record<string, string>,
  to: string,
): Promise<boolean> {
  const cc = [...V4_EMAIL_CC];
  const client = getSesClient();
  if (!client) {
    logDetail("send-skipped", {
      reason: "tencent_ses_credentials_missing",
      templateId,
      to: maskEmail(to),
    });
    return false;
  }

  const templateDataJson = JSON.stringify(templateData);
  logDetail("before-sdk-call", {
    templateId,
    subject,
    subjectLen: subject.length,
    to: maskEmail(to),
    cc: cc.map(maskEmail),
    from: maskEmail(FROM_EMAIL),
    templateDataKeyCount: Object.keys(templateData).length,
    templateData,
    templateDataLen: templateDataJson.length,
  });

  const startedAt = Date.now();
  try {
    const resp = await client.SendEmail({
      FromEmailAddress: FROM_EMAIL,
      Destination: [to],
      Cc: cc,
      Subject: subject,
      Template: {
        TemplateID: templateId,
        TemplateData: templateDataJson,
      },
    });
    const requestId =
      typeof resp === "object" && resp !== null && "RequestId" in resp
        ? String((resp as { RequestId?: string }).RequestId ?? "").trim()
        : "";
    const messageId =
      typeof resp === "object" &&
      resp !== null &&
      "MessageId" in resp &&
      typeof (resp as { MessageId?: string }).MessageId === "string"
        ? (resp as { MessageId: string }).MessageId
        : undefined;
    const ok = Boolean(requestId);
    logDetail("after-sdk-call", {
      sendSuccess: ok,
      templateId,
      to: maskEmail(to),
      requestId: requestId || null,
      messageId: messageId ?? null,
      elapsedMs: Date.now() - startedAt,
      responseKeys:
        typeof resp === "object" && resp !== null ? Object.keys(resp as object) : [],
    });
    if (!ok) {
      console.warn(`${LOG} 发信响应缺少 RequestId templateId=${templateId} to=${maskEmail(to)}`);
    }
    return ok;
  } catch (e) {
    const tencentError =
      typeof e === "object" && e !== null
        ? {
            code: "code" in e ? String((e as { code?: unknown }).code) : undefined,
            requestId:
              "requestId" in e ? String((e as { requestId?: unknown }).requestId) : undefined,
          }
        : undefined;
    logDetail("after-sdk-call-failed", {
      sendSuccess: false,
      templateId,
      to: maskEmail(to),
      elapsedMs: Date.now() - startedAt,
      tencentError,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    console.error(`${LOG} 发信失败 templateId=${templateId} to=${maskEmail(to)}`, e);
    return false;
  }
}

// ─── 公共接口 ────────────────────────────────────────────────────────────────────

export type TranslationJobSummary = {
  target: string;
  usedTokens: number;
  /** 从任务创建到完成的分钟数 */
  elapsedMinutes: number;
  /** 翻译完成百分比（0–100），用于部分翻译邮件 */
  completionPercent?: number;
};

/**
 * 手动翻译成功邮件（模板 137353）。
 * 对齐 TencentEmailService.sendSuccessEmail。
 */
export async function sendManualTranslationSuccessEmail(
  shopName: string,
  to: string,
  userName: string,
  job: TranslationJobSummary,
): Promise<boolean> {
  const shortName = parseShopName(shopName);
  const remaining = await getTsfRemainingForEmail(shopName);
  const remainingCredits = formatRemainingCredits(remaining);
  logDetail("send-manual-success-start", {
    shopName,
    shortName,
    userName,
    to: maskEmail(to),
    target: job.target,
    usedTokens: job.usedTokens,
    elapsedMinutes: job.elapsedMinutes,
    remainingCredits,
    remainingCreditsSource: remaining == null ? "unavailable" : "quota_query",
    templateId: TEMPLATE_MANUAL_SUCCESS,
  });
  return doSend(
    TEMPLATE_MANUAL_SUCCESS,
    SUBJECT_MANUAL_SUCCESS,
    {
      user: userName,
      shop_name: shortName,
      language: job.target,
      time: `${job.elapsedMinutes} minutes`,
      credit_count: formatNumber(job.usedTokens),
      remaining_credits: remainingCredits,
    },
    to,
  );
}

/**
 * 自动翻译成功邮件（模板 140352）。
 * 对齐 TencentEmailService.sendAutoTranslateEmail。
 * 支持同一封邮件汇总多个语言任务（每个为一个 html_data 块）。
 */
export async function sendAutoTranslationSuccessEmail(
  shopName: string,
  to: string,
  userName: string,
  jobs: TranslationJobSummary[],
): Promise<boolean> {
  const shortName = parseShopName(shopName);

  logDetail("send-auto-success-start", {
    shopName,
    shortName,
    userName,
    to: maskEmail(to),
    jobCount: jobs.length,
    targets: jobs.map((j) => j.target),
    usedTokens: jobs.map((j) => j.usedTokens),
    templateId: TEMPLATE_AUTO_SUCCESS,
  });

  const htmlParts = jobs
    .filter((j) => j.usedTokens > 0)
    .map(
      (j) =>
        `<div class="language-block">` +
        `<h4>${j.target}</h4>` +
        `<ul>` +
        `<li><span>Credits Used:</span> ${formatNumber(j.usedTokens)} credits used</li>` +
        `<li><span>Translation Time:</span> ${j.elapsedMinutes} minutes</li>` +
        `</ul>` +
        `</div>`,
    )
    .join("");

  if (!htmlParts) {
    logDetail("send-auto-success-skipped", {
      reason: "all_used_tokens_zero",
      shopName,
      to: maskEmail(to),
      jobCount: jobs.length,
    });
    return true;
  }

  return doSend(
    TEMPLATE_AUTO_SUCCESS,
    SUBJECT_AUTO_SUCCESS,
    {
      user: userName,
      shop_name: shortName,
      html_data: htmlParts,
    },
    to,
  );
}

/**
 * 翻译部分完成（额度不足暂停）邮件（模板 159297）。
 * 对齐 TencentEmailService.sendTranslatePartialEmail。
 * translateType: "auto translation" | "manual translation"
 */
export async function sendTranslationPartialEmail(
  shopName: string,
  to: string,
  userName: string,
  translateType: "auto translation" | "manual translation",
  jobs: TranslationJobSummary[],
): Promise<boolean> {
  const shortName = parseShopName(shopName);

  logDetail("send-partial-start", {
    shopName,
    shortName,
    userName,
    to: maskEmail(to),
    translateType,
    jobCount: jobs.length,
    targets: jobs.map((j) => j.target),
    completionPercents: jobs.map((j) => j.completionPercent ?? 0),
    templateId: TEMPLATE_PARTIAL,
  });

  const rowsHtml = jobs
    .map((j) => {
      const pct = (j.completionPercent ?? 0).toFixed(2);
      return (
        `<tr>` +
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;">${j.target}</td>` +
        `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${pct}%</td>` +
        `</tr>`
      );
    })
    .join("");

  if (!rowsHtml) {
    logDetail("send-partial-skipped", {
      reason: "no_job_rows",
      shopName,
      to: maskEmail(to),
      translateType,
    });
    return true;
  }

  return doSend(
    TEMPLATE_PARTIAL,
    SUBJECT_PARTIAL,
    {
      username: userName,
      translation: translateType,
      admin: shortName,
      language_progress_rows: rowsHtml,
    },
    to,
  );
}

/** 重置 SES 单例（仅用于测试）。 */
export function resetWorkerEmailClientForTests(): void {
  _client = null;
}
