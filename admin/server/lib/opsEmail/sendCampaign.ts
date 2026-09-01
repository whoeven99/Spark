import { buildShopParams, getOpsEmailAudienceByShops } from "./audience.js";
import { formatUtcNow, maskEmail } from "./maskEmail.js";
import {
  defaultGlobalParams,
  fillEmptyParams,
  renderCustomOpsEmail,
  renderPlaceholders,
} from "./renderTemplate.js";
import {
  sendSimpleEmail,
  sendTemplateEmail,
  resolveTestRecipient,
} from "./sesSimple.js";
import { insertSendLog } from "./store.js";
import { getOpsEmailTemplate } from "./templateCatalog.js";
import type { OpsEmailSendResult } from "./types.js";

const SEND_GAP_MS = 350;
const MAX_BATCH = 30;
const MAX_CUSTOM_HTML = 200_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OpsEmailSesPayload =
  | {
      mode: "template";
      templateId: number;
      label: string;
      subject: string;
      templateData: Record<string, string>;
    }
  | {
      mode: "simple";
      templateId: 0;
      label: string;
      subject: string;
      html: string;
    };

export function buildOpsEmailSendPayload(input: {
  templateKey: string;
  subjectOverride?: string;
  customHtml?: string;
  params: Record<string, string>;
}): OpsEmailSesPayload {
  const customHtml = input.customHtml?.trim() ?? "";
  if (customHtml) {
    const rendered = renderCustomOpsEmail({
      subject: input.subjectOverride ?? "",
      html: customHtml,
      params: input.params,
    });
    return {
      mode: "simple",
      templateId: 0,
      label: rendered.label,
      subject: rendered.subject,
      html: rendered.html,
    };
  }

  const template = getOpsEmailTemplate(input.templateKey);
  if (!template) {
    throw new Error(`未知邮件模板：${input.templateKey}`);
  }
  const params = { ...input.params };
  if (!String(params.path ?? "").trim()) params.path = "app";
  const subjectSource = input.subjectOverride?.trim() || template.subject;
  return {
    mode: "template",
    templateId: template.templateId,
    label: template.label,
    subject: renderPlaceholders(subjectSource, params),
    templateData: params,
  };
}

export async function sendOpsEmailCampaign(input: {
  templateKey: string;
  subjectOverride?: string;
  customHtml?: string;
  params: Record<string, string>;
  shops: string[];
  emailOverrides?: Record<string, string>;
  createdBy: string;
}): Promise<{
  results: OpsEmailSendResult[];
  testRecipient: string | null;
}> {
  const shops = [...new Set(input.shops.map((shop) => shop.trim().toLowerCase()))].filter(
    Boolean,
  );
  if (shops.length === 0) {
    throw new Error("请至少选择一家商店");
  }
  if (shops.length > MAX_BATCH) {
    throw new Error(`单次最多发送 ${MAX_BATCH} 家，请分批`);
  }

  const customHtml = input.customHtml?.trim() ?? "";
  if (customHtml && customHtml.length > MAX_CUSTOM_HTML) {
    throw new Error("自定义 HTML 过长");
  }
  if (customHtml && !input.subjectOverride?.trim()) {
    throw new Error("自定义模板需要填写主题");
  }
  if (!customHtml) {
    const template = getOpsEmailTemplate(input.templateKey);
    if (!template) {
      throw new Error(`未知邮件模板：${input.templateKey}`);
    }
  }

  const byShop = await getOpsEmailAudienceByShops(shops);
  const globalParams = { ...defaultGlobalParams(), ...input.params };
  const testRecipient = resolveTestRecipient();
  const templateKey = customHtml ? input.templateKey.trim() || "custom" : input.templateKey;
  const results: OpsEmailSendResult[] = [];

  for (const [index, shop] of shops.entries()) {
    if (index > 0) await sleep(SEND_GAP_MS);
    const row = byShop.get(shop);
    if (!row) {
      results.push({ shop, emailMasked: null, status: "skipped", error: "未找到商店资料" });
      continue;
    }
    const override = input.emailOverrides?.[shop]?.trim();
    const to = testRecipient || override || row.email?.trim();
    if (!to) {
      const skipped = {
        shop,
        emailMasked: null,
        status: "skipped" as const,
        error: "无可用邮箱",
      };
      results.push(skipped);
      await insertSendLog({
        shop,
        emailMasked: null,
        templateKey,
        templateId: customHtml ? 0 : (getOpsEmailTemplate(templateKey)?.templateId ?? 0),
        subject: "",
        status: "skipped",
        error: skipped.error,
        requestId: null,
        createdBy: input.createdBy,
      });
      continue;
    }

    const shopParams = buildShopParams(row);
    if (override) shopParams.email = override;
    const params = fillEmptyParams(globalParams, {
      ...shopParams,
      occurredAtUtc: formatUtcNow(),
      installedAtUtc: formatUtcNow(),
    });
    const payload = buildOpsEmailSendPayload({
      templateKey,
      subjectOverride: input.subjectOverride,
      customHtml,
      params,
    });
    const context = {
      shop,
      templateKey,
      templateId: payload.templateId,
      templateData: payload.mode === "template" ? payload.templateData : params,
      htmlLength: payload.mode === "simple" ? payload.html.length : undefined,
    };
    const sent =
      payload.mode === "template"
        ? await sendTemplateEmail({
            to,
            subject: payload.subject,
            templateId: payload.templateId,
            templateData: payload.templateData,
            context,
          })
        : await sendSimpleEmail({
            to,
            subject: payload.subject,
            html: payload.html,
            context,
          });
    const result: OpsEmailSendResult = sent.ok
      ? {
          shop,
          emailMasked: maskEmail(to),
          status: "sent",
          requestId: sent.requestId,
        }
      : {
          shop,
          emailMasked: maskEmail(to),
          status: "failed",
          error: sent.message,
          requestId: sent.requestId ?? undefined,
        };
    results.push(result);
    await insertSendLog({
      shop,
      emailMasked: result.emailMasked,
      templateKey,
      templateId: payload.templateId,
      subject: payload.subject,
      status: result.status,
      error: result.error ?? null,
      requestId: result.requestId ?? null,
      createdBy: input.createdBy,
    });
  }

  return { results, testRecipient };
}
