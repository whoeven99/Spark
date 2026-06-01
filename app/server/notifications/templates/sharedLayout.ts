import type {
  BaseNotificationVariables,
  CreditAccountChange,
  NotificationAppConfig,
  NotificationEvent,
  NotificationLocale,
  NotificationVariablesByEvent,
} from "../types";

export type TemplateRow = {
  label: string;
  value?: string | number | null;
};

export type TemplateAction = {
  label: string;
  url?: string;
};

export type TemplateDisplay = {
  appName: string;
  brandName: string;
  supportEmail: string;
  helpCenterUrl?: string;
};

export const REVIEW_SAFE_APP_URL = "https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email";

export type TemplateContext<TVariables extends BaseNotificationVariables> = {
  appConfig: NotificationAppConfig;
  variables: TVariables;
  display: TemplateDisplay;
  locale: NotificationLocale;
};

export type TemplateContent = {
  subject: string;
  preheader: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  details: TemplateRow[];
  action?: TemplateAction;
};

export type NotificationTemplate<E extends NotificationEvent> = (
  context: TemplateContext<NotificationVariablesByEvent[E]>,
) => TemplateContent;

export type NotificationTemplateRegistry = {
  [Event in NotificationEvent]: NotificationTemplate<Event>;
};

export function createTemplateContext<E extends NotificationEvent>(
  locale: NotificationLocale,
  appConfig: NotificationAppConfig,
  variables: NotificationVariablesByEvent[E],
): TemplateContext<NotificationVariablesByEvent[E]> {
  const appName = variables.appName ?? appConfig.appName;
  const brandName = variables.brandName ?? appConfig.brandName ?? appName;

  return {
    appConfig,
    variables,
    locale,
    display: {
      appName,
      brandName,
      supportEmail: variables.supportEmail ?? appConfig.supportEmail,
      helpCenterUrl: variables.helpCenterUrl ?? appConfig.helpCenterUrl,
    },
  };
}

export function commonRows(variables: BaseNotificationVariables, labels: {
  shopName: string;
  shopDomain: string;
  occurredAtUtc: string;
}): TemplateRow[] {
  return [
    { label: labels.shopName, value: variables.shopName },
    { label: labels.shopDomain, value: variables.shopDomain },
    { label: labels.occurredAtUtc, value: variables.occurredAtUtc },
  ];
}

export function creditRows(change: CreditAccountChange | undefined, labels: {
  changed: string;
  before: string;
  after: string;
  reason: string;
}): TemplateRow[] {
  if (!change) {
    return [];
  }

  const unit = change.creditUnit ? ` ${change.creditUnit}` : "";

  return [
    {
      label: labels.changed,
      value: change.creditsChanged === undefined ? undefined : `${change.creditsChanged}${unit}`,
    },
    {
      label: labels.before,
      value: change.creditsBefore === undefined ? undefined : `${change.creditsBefore}${unit}`,
    },
    {
      label: labels.after,
      value: change.creditsAfter === undefined ? undefined : `${change.creditsAfter}${unit}`,
    },
    { label: labels.reason, value: change.reason },
  ];
}

export function renderHtmlEmail(
  locale: NotificationLocale,
  content: TemplateContent,
  display: TemplateDisplay,
): string {
  const footer =
    locale === "zh-CN"
      ? `这是一封与 ${display.appName} 服务状态相关的功能通知邮件。我们会在安装、订阅、积分账户和任务执行等关键节点发送提醒，帮助您及时了解店铺里的 app 使用情况。如有疑问，请联系 ${display.supportEmail}。`
      : `This is a functional notification about your ${display.appName} service status. We send reminders for important installation, subscription, credit account, and task events so your team can stay informed. If you have questions, contact ${display.supportEmail}.`;

  const details = content.details
    .filter((row) => hasValue(row.value))
    .map(
      (row) => `
        <tr>
          <td style="padding:9px 0;color:#52606d;font-size:14px;line-height:1.6;">${escapeHtml(row.label)}</td>
          <td style="padding:9px 0;color:#0f2b46;font-size:14px;font-weight:700;line-height:1.6;text-align:right;">${escapeHtml(String(row.value))}</td>
        </tr>`,
    )
    .join("");

  const action = content.action?.url
    ? `<p style="margin:0 0 18px;color:#0f2b46;font-size:15px;line-height:1.75;">${escapeHtml(actionHint(locale))}</p><p style="margin:0;"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:#0f2b46;color:#ffffff;text-decoration:none;border-radius:25px;padding:12px 20px;font-size:15px;font-weight:700;">${escapeHtml(content.action.label)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#fafafa;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f2b46;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(content.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;padding:20px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;">
            <tr>
              <td align="center" style="padding:22px 40px 14px;background:#ffffff;">
                <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                  <tr>
                    <td>
                      <p style="margin:0 0 2px;color:#0f2b46;font-size:16px;font-weight:700;line-height:1.35;text-align:left;">${escapeHtml(display.appName)}</p>
                      <p style="margin:0;color:#52606d;font-size:12px;line-height:1.35;text-align:left;">${escapeHtml(display.brandName)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 22px;background:#ffffff;">
                <h1 style="margin:0 0 22px;color:#0f2b46;font-size:30px;font-weight:500;line-height:1.35;">${escapeHtml(content.title)}</h1>
                <p style="margin:0 0 18px;color:#0f2b46;font-size:15px;line-height:1.75;">${escapeHtml(content.greeting)}</p>
                ${content.paragraphs
                  .map(
                    (paragraph) =>
                      `<p style="margin:0 0 16px;color:#0f2b46;font-size:15px;line-height:1.75;">${escapeHtml(paragraph)}</p>`,
                  )
                  .join("")}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px 24px;background:#f8f8f8;">
                <p style="margin:0 0 12px;color:#0f2b46;font-size:18px;font-weight:700;line-height:1.5;">${escapeHtml(detailsTitle(locale))}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${details}
              </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 40px 26px;background:#eaffe9;">
              ${action}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 20px 8px;background:#fafafa;">
                <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 0 12px;">
                  <tr>
                    <td>
                      <p style="margin:0;color:#33475b;font-size:12px;font-weight:700;line-height:1.35;text-align:left;">${escapeHtml(display.appName)}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 auto;color:#52606d;font-size:11px;line-height:1.7;text-align:center;max-width:560px;">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderTextEmail(content: TemplateContent, display: TemplateDisplay): string {
  const detailLines = content.details
    .filter((row) => hasValue(row.value))
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");

  const action = content.action?.url ? `\n${content.action.label}: ${content.action.url}` : "";

  return [
    content.title,
    "",
    content.greeting,
    "",
    ...content.paragraphs,
    "",
    detailLines,
    action,
    "",
    `${display.brandName} / ${display.supportEmail}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function hasValue(value: TemplateRow["value"]): boolean {
  return value !== undefined && value !== null && value !== "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function actionHint(locale: NotificationLocale): string {
  return locale === "zh-CN"
    ? "点击下方按钮，进入 Shopify App 查看完整详情。"
    : "Use the button below to open the Shopify App and review the full details.";
}
