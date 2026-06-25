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

const LOG = "[workerEmail]";

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

function getSesClient(): SesClientInstance | null {
  if (_client) return _client;
  const secretId = process.env.TENCENT_CLOUD_KEY_ID?.trim();
  const secretKey = process.env.TENCENT_CLOUD_KEY?.trim();
  if (!secretId || !secretKey) return null;
  const region = process.env.TENCENT_SES_REGION?.trim() || "ap-hongkong";
  _client = new ses.v20201002.Client({
    credential: { secretId, secretKey },
    region,
  });
  return _client;
}

const FROM_EMAIL =
  process.env.TENCENT_FROM_EMAIL?.trim() || "support@msg.ciwi.ai";

/** 去掉 .myshopify.com 后缀，得到可读店名。 */
function parseShopName(shopName: string): string {
  return shopName.replace(/\.myshopify\.com$/, "");
}

/** 数字格式化为千分位（对齐 Java NumberFormat.getNumberInstance(Locale.US)）。 */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

async function doSend(
  templateId: number,
  subject: string,
  templateData: Record<string, string>,
  to: string,
): Promise<boolean> {
  const client = getSesClient();
  if (!client) {
    console.warn(`${LOG} Tencent SES 凭证未配置，跳过发信 templateId=${templateId} to=${to}`);
    return false;
  }

  try {
    const resp = await client.SendEmail({
      FromEmailAddress: FROM_EMAIL,
      Destination: [to],
      Subject: subject,
      Template: {
        TemplateID: templateId,
        TemplateData: JSON.stringify(templateData),
      },
    });
    const ok = Boolean((resp as { RequestId?: string }).RequestId);
    console.info(`${LOG} 发信 ${ok ? "✅" : "❌"} templateId=${templateId} to=${to}`);
    return ok;
  } catch (e) {
    console.error(`${LOG} 发信失败 templateId=${templateId} to=${to}`, e);
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
  job: TranslationJobSummary,
): Promise<boolean> {
  const shortName = parseShopName(shopName);
  return doSend(
    TEMPLATE_MANUAL_SUCCESS,
    SUBJECT_MANUAL_SUCCESS,
    {
      user: shortName,
      shop_name: shortName,
      language: job.target,
      time: `${job.elapsedMinutes} minutes`,
      credit_count: formatNumber(job.usedTokens),
      remaining_credits: "—",
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
  jobs: TranslationJobSummary[],
): Promise<boolean> {
  const shortName = parseShopName(shopName);

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
    console.info(`${LOG} sendAutoTranslationSuccessEmail: usedTokens 均为 0，跳过 shop=${shopName}`);
    return true;
  }

  return doSend(
    TEMPLATE_AUTO_SUCCESS,
    SUBJECT_AUTO_SUCCESS,
    {
      user: shortName,
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
  translateType: "auto translation" | "manual translation",
  jobs: TranslationJobSummary[],
): Promise<boolean> {
  const shortName = parseShopName(shopName);

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
    console.info(`${LOG} sendTranslationPartialEmail: 无任务数据，跳过 shop=${shopName}`);
    return true;
  }

  return doSend(
    TEMPLATE_PARTIAL,
    SUBJECT_PARTIAL,
    {
      username: shortName,
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
