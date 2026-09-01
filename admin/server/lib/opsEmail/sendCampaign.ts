import { listOpsEmailAudience, buildShopParams } from "./audience.js";
import { formatUtcNow, maskEmail } from "./maskEmail.js";
import { defaultGlobalParams, renderOpsEmailTemplate } from "./renderTemplate.js";
import { resolveTestRecipient, sendSimpleEmail } from "./sesSimple.js";
import { insertSendLog } from "./store.js";
import type { OpsEmailSendResult } from "./types.js";

const SEND_GAP_MS = 350;
const MAX_BATCH = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendOpsEmailCampaign(input: {
  templateKey: string;
  subjectOverride?: string;
  params: Record<string, string>;
  shops: string[];
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

  const audience = await listOpsEmailAudience({});
  const byShop = new Map(audience.shops.map((row) => [row.shop, row]));
  const globalParams = { ...defaultGlobalParams(), ...input.params };
  const testRecipient = resolveTestRecipient();
  const results: OpsEmailSendResult[] = [];

  for (const [index, shop] of shops.entries()) {
    if (index > 0) await sleep(SEND_GAP_MS);
    const row = byShop.get(shop);
    if (!row) {
      results.push({ shop, emailMasked: null, status: "skipped", error: "不在翻译用户列表中" });
      continue;
    }
    const to = testRecipient || row.email?.trim();
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
        templateKey: input.templateKey,
        templateId: 0,
        subject: "",
        status: "skipped",
        error: skipped.error,
        requestId: null,
        createdBy: input.createdBy,
      });
      continue;
    }

    const params = {
      ...globalParams,
      ...buildShopParams(row),
      occurredAtUtc: globalParams.occurredAtUtc || formatUtcNow(),
      installedAtUtc: globalParams.installedAtUtc || formatUtcNow(),
    };
    const rendered = renderOpsEmailTemplate({
      templateKey: input.templateKey,
      params,
      subjectOverride: input.subjectOverride,
    });
    const sent = await sendSimpleEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
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
        };
    results.push(result);
    await insertSendLog({
      shop,
      emailMasked: result.emailMasked,
      templateKey: input.templateKey,
      templateId: rendered.templateId,
      subject: rendered.subject,
      status: result.status,
      error: result.error ?? null,
      requestId: result.requestId ?? null,
      createdBy: input.createdBy,
    });
  }

  return { results, testRecipient };
}
