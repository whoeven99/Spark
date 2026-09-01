import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getOpsEmailTemplate,
  OPS_EMAIL_CTA_HREF,
  resolveTencentHtmlRoot,
} from "./templateCatalog.js";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const match of source.matchAll(PLACEHOLDER_RE)) {
    keys.add(match[1]);
  }
  return [...keys];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPlaceholders(
  source: string,
  params: Record<string, string>,
): string {
  return source.replace(PLACEHOLDER_RE, (_all, key: string) => {
    const value = params[key];
    return value == null ? "" : escapeHtml(value);
  });
}

export function loadTemplateHtml(htmlFile: string): string {
  const root = resolveTencentHtmlRoot();
  return readFileSync(path.join(root, htmlFile), "utf8");
}

export function applyInstallUrl(html: string, installUrl?: string): string {
  if (!installUrl?.trim()) return html;
  return html.replaceAll(OPS_EMAIL_CTA_HREF, "{{installUrl}}");
}

export function defaultGlobalParams(): Record<string, string> {
  return {
    appName: process.env.NOTIFICATION_APP_NAME?.trim() || "Spark AI",
    brandName: process.env.NOTIFICATION_BRAND_NAME?.trim() || "Spark AI",
    supportEmail:
      process.env.NOTIFICATION_SUPPORT_EMAIL?.trim() || "support@ciwi.ai",
    installUrl: process.env.SPARK_INSTALL_URL?.trim() || "",
    path: "",
  };
}

export function collectTemplateKeys(subject: string, html: string): string[] {
  return [...new Set([...extractTemplateKeys(subject), ...extractTemplateKeys(html)])];
}

export function catalogOperatorKeys(subject: string, html: string): string[] {
  const keys = collectTemplateKeys(subject, html);
  const hasCta =
    html.includes(OPS_EMAIL_CTA_HREF) ||
    html.includes("{{shop_id}}") ||
    html.includes("{{path}}");
  if (hasCta && !keys.includes("installUrl")) keys.push("installUrl");
  return keys;
}

export function paramsForKeys(
  keys: string[],
  defaults: Record<string, string>,
  prev: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of keys) {
    next[key] = prev[key] ?? defaults[key] ?? "";
  }
  return next;
}

export function fillEmptyParams(
  params: Record<string, string>,
  fallback: Record<string, string>,
): Record<string, string> {
  const next = { ...params };
  for (const [key, value] of Object.entries(fallback)) {
    if (!String(next[key] ?? "").trim()) next[key] = value;
  }
  return next;
}

export function renderCustomOpsEmail(input: {
  subject: string;
  html: string;
  params: Record<string, string>;
}): {
  templateId: number;
  label: string;
  keys: string[];
  subject: string;
  html: string;
} {
  const subject = input.subject.trim();
  const html = input.html.trim();
  if (!subject) throw new Error("自定义模板需要填写主题");
  if (!html) throw new Error("自定义模板需要填写 HTML");

  const htmlWithCta = applyInstallUrl(html, input.params.installUrl);
  const keys = collectTemplateKeys(subject, htmlWithCta);
  return {
    templateId: 0,
    label: "自定义模板",
    keys,
    subject: renderPlaceholders(subject, input.params),
    html: renderPlaceholders(htmlWithCta, input.params),
  };
}

export function renderOpsEmailTemplate(input: {
  templateKey: string;
  params: Record<string, string>;
  subjectOverride?: string;
}): {
  templateId: number;
  label: string;
  keys: string[];
  subject: string;
  html: string;
} {
  const template = getOpsEmailTemplate(input.templateKey);
  if (!template) {
    throw new Error(`未知邮件模板：${input.templateKey}`);
  }

  const rawHtml = loadTemplateHtml(template.htmlFile);
  const htmlWithCta = applyInstallUrl(rawHtml, input.params.installUrl);
  const keys = collectTemplateKeys(template.subject, htmlWithCta);
  const subjectSource = input.subjectOverride?.trim() || template.subject;

  return {
    templateId: template.templateId,
    label: template.label,
    keys,
    subject: renderPlaceholders(subjectSource, input.params),
    html: renderPlaceholders(htmlWithCta, input.params),
  };
}
