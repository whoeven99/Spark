import { Router } from "express";
import {
  buildShopParams,
  listOpsEmailAudience,
} from "../lib/opsEmail/audience.js";
import { formatUtcNow } from "../lib/opsEmail/maskEmail.js";
import {
  defaultGlobalParams,
  extractTemplateKeys,
  loadTemplateHtml,
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

function parseBool(value: unknown, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
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
    const keys = [
      ...new Set(["installUrl", ...extractTemplateKeys(template.subject), ...extractTemplateKeys(html)]),
    ];
    res.json({ template, keys, defaultParams: defaultGlobalParams() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

opsEmailRouter.post("/preview", async (req, res) => {
  try {
    const templateKey = String(req.body?.templateKey ?? "").trim();
    const subjectOverride =
      typeof req.body?.subject === "string" ? req.body.subject : undefined;
    const params = {
      ...defaultGlobalParams(),
      ...(req.body?.params && typeof req.body.params === "object"
        ? req.body.params
        : {}),
    };
    const previewShop = String(req.body?.shop ?? "").trim().toLowerCase();
    if (previewShop) {
      const audience = await listOpsEmailAudience({ search: previewShop });
      const row = audience.shops.find((item) => item.shop === previewShop);
      if (row) {
        Object.assign(params, buildShopParams(row), {
          occurredAtUtc: params.occurredAtUtc || formatUtcNow(),
          installedAtUtc: params.installedAtUtc || formatUtcNow(),
        });
      }
    }
    const rendered = renderOpsEmailTemplate({
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
    const data = await listOpsEmailAudience({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      installedOnly: parseBool(req.query.installedOnly, true),
      hasEmailOnly: parseBool(req.query.hasEmailOnly, true),
      excludeSpark: parseBool(req.query.excludeSpark, true),
      planKey:
        typeof req.query.planKey === "string" && req.query.planKey.trim()
          ? req.query.planKey.trim()
          : undefined,
    });
    res.json(data);
  } catch (error) {
    console.error("[ops-email/audience]", error);
    res.status(500).json({ error: String(error) });
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
    const params =
      req.body?.params && typeof req.body.params === "object"
        ? (req.body.params as Record<string, string>)
        : {};
    const subjectOverride =
      typeof req.body?.subject === "string" ? req.body.subject : undefined;
    const createdBy = String(res.locals.adminUserId ?? "unknown");
    const result = await sendOpsEmailCampaign({
      templateKey,
      subjectOverride,
      params,
      shops,
      createdBy,
    });
    res.json(result);
  } catch (error) {
    console.error("[ops-email/send]", error);
    res.status(400).json({ error: String(error) });
  }
});
