import { Router } from "express";
import {
  buildShopParams,
  getOpsEmailAudienceByShops,
  listOpsEmailAudience,
} from "../lib/opsEmail/audience.js";
import { backfillMissingShopEmails, setShopSessionEmail } from "../lib/opsEmail/backfillEmails.js";
import { formatUtcNow } from "../lib/opsEmail/maskEmail.js";
import {
  catalogOperatorKeys,
  defaultGlobalParams,
  fillEmptyParams,
  loadTemplateHtml,
  renderCustomOpsEmail,
  renderOpsEmailTemplate,
} from "../lib/opsEmail/renderTemplate.js";
import { sendOpsEmailCampaign } from "../lib/opsEmail/sendCampaign.js";
import { isOpsEmailSendReady } from "../lib/opsEmail/sesSimple.js";
import { listRecentSendLogs } from "../lib/opsEmail/store.js";
import {
  getOpsEmailTemplate,
  listOpsEmailTemplates,
} from "../lib/opsEmail/templateCatalog.js";

export const opsEmailRouter = Router();

const MAX_CUSTOM_HTML = 200_000;

function parseBool(value: unknown, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") next[key] = item;
  }
  return next;
}

function parseAudienceFilters(source: Record<string, unknown>) {
  return {
    search: typeof source.search === "string" ? source.search : undefined,
    installedOnly: parseBool(source.installedOnly, true),
    hasEmailOnly: parseBool(source.hasEmailOnly, true),
    excludeSpark: parseBool(source.excludeSpark, true),
    planKey:
      typeof source.planKey === "string" && source.planKey.trim()
        ? source.planKey.trim()
        : undefined,
  };
}

opsEmailRouter.get("/templates", (_req, res) => {
  res.json({
    templates: listOpsEmailTemplates(),
    defaultParams: defaultGlobalParams(),
    sendReady: isOpsEmailSendReady(),
  });
});

opsEmailRouter.get("/templates/:key", (req, res) => {
  try {
    const template = getOpsEmailTemplate(req.params.key);
    if (!template) {
      res.status(404).json({ error: "模板不存在" });
      return;
    }
    const html = loadTemplateHtml(template.htmlFile);
    const keys = catalogOperatorKeys(template.subject, html);
    res.json({ template, keys, html, defaultParams: defaultGlobalParams() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

opsEmailRouter.post("/preview", async (req, res) => {
  try {
    const templateKey = String(req.body?.templateKey ?? "").trim();
    const subjectOverride =
      typeof req.body?.subject === "string" ? req.body.subject : undefined;
    const customHtml =
      typeof req.body?.customHtml === "string" ? req.body.customHtml.trim() : "";
    if (customHtml.length > MAX_CUSTOM_HTML) {
      res.status(400).json({ error: "自定义 HTML 过长" });
      return;
    }
    let params = {
      ...defaultGlobalParams(),
      ...parseStringRecord(req.body?.params),
    };
    const previewShop = String(req.body?.shop ?? "").trim().toLowerCase();
    if (previewShop) {
      const byShop = await getOpsEmailAudienceByShops([previewShop]);
      const row = byShop.get(previewShop);
      if (row) {
        params = fillEmptyParams(params, {
          ...buildShopParams(row),
          occurredAtUtc: formatUtcNow(),
          installedAtUtc: formatUtcNow(),
        });
      }
    }
    const rendered = customHtml
      ? renderCustomOpsEmail({
          subject: subjectOverride ?? "",
          html: customHtml,
          params,
        })
      : renderOpsEmailTemplate({
          templateKey,
          params,
          subjectOverride,
        });
    res.json({ ...rendered, params });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

opsEmailRouter.get("/audience", async (req, res) => {
  try {
    const data = await listOpsEmailAudience(parseAudienceFilters(req.query as Record<string, unknown>));
    res.json(data);
  } catch (error) {
    console.error("[ops-email/audience]", error);
    res.status(500).json({ error: String(error) });
  }
});

opsEmailRouter.post("/backfill-emails", async (req, res) => {
  try {
    const data = await backfillMissingShopEmails(
      parseAudienceFilters((req.body ?? {}) as Record<string, unknown>),
    );
    res.json(data);
  } catch (error) {
    console.error("[ops-email/backfill-emails]", error);
    res.status(500).json({ error: String(error) });
  }
});

opsEmailRouter.post("/shop-email", async (req, res) => {
  try {
    const shop = String(req.body?.shop ?? "").trim().toLowerCase();
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    if (!shop) {
      res.status(400).json({ error: "商店不能为空" });
      return;
    }
    const data = await setShopSessionEmail(shop, email);
    res.json(data);
  } catch (error) {
    console.error("[ops-email/shop-email]", error);
    res.status(400).json({ error: String(error) });
  }
});

opsEmailRouter.get("/sends", async (_req, res) => {
  try {
    const sends = await listRecentSendLogs(80);
    res.json({ sends });
  } catch (error) {
    console.error("[ops-email/sends]", error);
    res.status(500).json({ error: String(error) });
  }
});

opsEmailRouter.post("/send", async (req, res) => {
  try {
    const templateKey = String(req.body?.templateKey ?? "").trim();
    const shops = Array.isArray(req.body?.shops)
      ? req.body.shops.map((item: unknown) => String(item))
      : [];
    const params = parseStringRecord(req.body?.params);
    const subjectOverride =
      typeof req.body?.subject === "string" ? req.body.subject : undefined;
    const customHtml =
      typeof req.body?.customHtml === "string" ? req.body.customHtml : undefined;
    const emailOverrides = parseStringRecord(req.body?.emailOverrides);
    const createdBy = String(res.locals.adminUserId ?? "unknown");
    const result = await sendOpsEmailCampaign({
      templateKey,
      subjectOverride,
      customHtml,
      params,
      shops,
      emailOverrides,
      createdBy,
    });
    res.json(result);
  } catch (error) {
    console.error("[ops-email/send]", error);
    res.status(400).json({ error: String(error) });
  }
});
