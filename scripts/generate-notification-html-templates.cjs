/* eslint-env node */

const fs = require("fs");
const path = require("path");

const outputRoot = path.join(
  __dirname,
  "..",
  "app",
  "server",
  "notifications",
  "tencent-cloud-html",
);

const reviewSafeAppUrl = "https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email";

const commonDetails = {
  zh: [
    ["店铺名称", "{{shopName}}"],
    ["店铺域名", "{{shopDomain}}"],
  ],
  en: [
    ["Shop name", "{{shopName}}"],
    ["Shop domain", "{{shopDomain}}"],
  ],
};

const creditDetails = {
  zh: [
    ["积分变动", "{{creditsChanged}} {{creditUnit}}"],
    ["变动前余额", "{{creditsBefore}} {{creditUnit}}"],
    ["变动后余额", "{{creditsAfter}} {{creditUnit}}"],
    ["积分说明", "{{creditReason}}"],
  ],
  en: [
    ["Credit change", "{{creditsChanged}} {{creditUnit}}"],
    ["Balance before", "{{creditsBefore}} {{creditUnit}}"],
    ["Balance after", "{{creditsAfter}} {{creditUnit}}"],
    ["Credit note", "{{creditReason}}"],
  ],
};

const templates = {
  "zh-CN": {
    appInstalled: {
      subject: "{{appName}} 已成功安装",
      title: "{{appName}} 已成功安装",
      preheader: "{{appName}} 已连接到 {{shopName}}，您可以开始使用相关功能。",
      greeting: "Hi {{recipientName}}，",
      paragraphs: [
        "{{appName}} 已经连接到 {{shopName}}。你可以打开 Shopify App 完成设置，并开始使用相关功能。",
        "接下来，我们会在安装、订阅、积分和任务状态发生变化时发来简短提醒。这样你不用反复检查，也能及时了解 app 的运行情况。",
        "如果这次安装不是你或团队成员操作的，建议回到 Shopify 后台看一下应用记录，确认店铺权限仍然安全。",
      ],
      details: [...commonDetails.zh, ["安装时间 (UTC+0)", "{{installedAtUtc}}"] ],
      actionLabel: "前往 Shopify App 查看",
      actionUrl: reviewSafeAppUrl,
    },
    appUninstalled: {
      subject: "{{appName}} 已从店铺卸载",
      title: "{{appName}} 已从店铺卸载",
      preheader: "{{appName}} 已不再连接到 {{shopName}}。",
      greeting: "Hi {{recipientName}}，",
      paragraphs: [
        "{{appName}} 已从 {{shopName}} 卸载。相关自动任务会停止，app 也不会继续访问这家店铺的数据。",
        "如果这是计划内操作，就不用再处理了。若你不确定是谁卸载的，可以先查看 Shopify 后台的应用记录。",
        "账单、任务和积分账户的必要记录可能会保留一段时间，方便后续对账或客户支持。",
      ],
      details: [...commonDetails.zh, ["卸载时间 (UTC+0)", "{{uninstalledAtUtc}}"] ],
      actionLabel: "查看 Shopify App 状态",
      actionUrl: reviewSafeAppUrl,
    },
    purchaseCreated: {
      subject: "{{appName}} 购买记录已生成",
      title: "购买记录已生成",
      preheader: "{{shopName}} 的购买或充值记录已生成，请查看订单和积分账户信息。",
      greeting: "Hi {{recipientName}}，",
      paragraphs: [
        "{{appName}} 已记录一笔购买、订阅或积分充值。下面是这次变动的明细，方便你留存和对账。",
        "如果这次购买包含积分，余额会在支付确认或处理完成后更新。不同支付渠道可能会有短暂延迟，最终结果以 Shopify App 内显示为准。",
        "如果你没有发起这次购买，或对金额、套餐、积分变动有疑问，可以保留这封邮件并联系我们。我们会根据店铺、订单和时间帮你核对。",
        "积分可用于任务执行、额度消耗或其他按量功能。你可以在 Shopify App 里查看完整的积分明细。",
      ],
      details: [
        ...commonDetails.zh,
        ["发生时间 (UTC+0)", "{{occurredAtUtc}}"],
        ["购买类型", "{{purchaseType}}"],
        ["订单编号", "{{orderId}}"],
        ["套餐或项目", "{{planName}}"],
        ["金额 (USD)", "{{amountUsd}}"],
        ["计费周期", "{{billingPeriod}}"],
        ...creditDetails.zh,
      ],
      actionLabel: "前往 Shopify App 查看",
      actionUrl: reviewSafeAppUrl,
    },
    subscriptionStarted: subscriptionZh("{{appName}} 订阅已开始", "订阅已开始", "{{appName}} 订阅已经生效。这里是当前套餐、计费周期和积分账户的简要明细。"),
    subscriptionChanged: subscriptionZh("{{appName}} 订阅已变更", "订阅已变更", "{{appName}} 订阅已更新。下面是这次变更的明细，方便你快速核对。"),
    subscriptionCanceled: subscriptionZh("{{appName}} 订阅已取消", "订阅已取消", "{{appName}} 订阅已取消。当前账期结束后，部分高级能力、自动任务或额度可能会停止。"),
    taskStarted: taskZh("{{appName}} 任务已开始", "任务已开始", "{{appName}} 已开始处理 {{taskName}}。我们会在任务完成、暂停或需要你查看时继续同步状态。", "开始时间 (UTC+0)", "{{startedAtUtc}}"),
    taskCompleted: taskZh("{{appName}} 任务已完成", "任务已完成", "好消息，{{taskName}} 已经处理完成。你可以前往 Shopify App 查看结果、日志和相关明细。", "完成时间 (UTC+0)", "{{completedAtUtc}}"),
    taskPaused: taskZh("{{appName}} 任务已暂停", "任务已暂停", "{{taskName}} 已暂停。暂停期间，任务通常不会继续处理新数据，也不会继续产生相关消耗。", "暂停时间 (UTC+0)", "{{pausedAtUtc}}"),
    taskFailed: taskZh("{{appName}} 任务执行失败", "任务执行失败", "{{taskName}} 这次没有完成。你可以前往 Shopify App 查看失败原因，并检查配置、授权、积分余额或第三方连接。", "失败时间 (UTC+0)", "{{occurredAtUtc}}", [["失败原因", "{{failureReason}}"]]),
  },
  en: {
    appInstalled: {
      subject: "{{appName}} has been installed",
      title: "{{appName}} has been installed",
      preheader: "{{appName}} is now connected to {{shopName}}.",
      greeting: "Hi {{recipientName}},",
      paragraphs: [
        "{{appName}} is now connected to {{shopName}}. Open the Shopify App to finish setup and start using the available features.",
        "From here, we will send short updates when installation, subscription, credit, or task status changes. That way, your team can stay aligned without checking manually.",
        "If this installation was not made by you or your team, review your Shopify app activity and confirm that store access is still secure.",
      ],
      details: [...commonDetails.en, ["Installed at (UTC+0)", "{{installedAtUtc}}"] ],
      actionLabel: "Open Shopify App",
      actionUrl: reviewSafeAppUrl,
    },
    appUninstalled: {
      subject: "{{appName}} has been uninstalled",
      title: "{{appName}} has been uninstalled",
      preheader: "{{appName}} is no longer connected to {{shopName}}.",
      greeting: "Hi {{recipientName}},",
      paragraphs: [
        "{{appName}} has been uninstalled from {{shopName}}. Related automated tasks will stop, and the app will no longer access data for this store.",
        "If this was expected, no further action is needed. If you are not sure who made the change, review the app activity in Shopify.",
        "Billing, task, and credit account records may be kept for a limited time to support reconciliation and customer support.",
      ],
      details: [...commonDetails.en, ["Uninstalled at (UTC+0)", "{{uninstalledAtUtc}}"] ],
      actionLabel: "View Shopify App status",
      actionUrl: reviewSafeAppUrl,
    },
    purchaseCreated: {
      subject: "{{appName}} purchase record created",
      title: "Purchase record created",
      preheader: "A purchase or credit transaction has been recorded for {{shopName}}.",
      greeting: "Hi {{recipientName}},",
      paragraphs: [
        "{{appName}} recorded a purchase, subscription, or credit top-up. Here is the breakdown for your billing records.",
        "If credits are included, the balance will update after payment confirmation or system processing. There may be a short delay depending on the payment channel, and the Shopify App balance is the source of truth.",
        "If you did not make this purchase, or if the amount, plan, or credit change looks off, keep this email and contact us. We will help check it using the shop, order, and event time.",
        "Credits can be used for task execution, usage quotas, and other metered features. You can view the full credit history in the Shopify App.",
      ],
      details: [
        ...commonDetails.en,
        ["Time (UTC+0)", "{{occurredAtUtc}}"],
        ["Purchase type", "{{purchaseType}}"],
        ["Order ID", "{{orderId}}"],
        ["Plan or item", "{{planName}}"],
        ["Amount (USD)", "{{amountUsd}}"],
        ["Billing period", "{{billingPeriod}}"],
        ...creditDetails.en,
      ],
      actionLabel: "Open Shopify App",
      actionUrl: reviewSafeAppUrl,
    },
    subscriptionStarted: subscriptionEn("{{appName}} subscription started", "Subscription started", "{{appName}} is now active. Here is a quick breakdown of the current plan, billing period, and credit account."),
    subscriptionChanged: subscriptionEn("{{appName}} subscription changed", "Subscription changed", "{{appName}} has been updated. The plan, timing, and any related credit changes are listed below."),
    subscriptionCanceled: subscriptionEn("{{appName}} subscription canceled", "Subscription canceled", "{{appName}} has been canceled. Some premium features, automated tasks, or usage quotas may stop after the current billing period ends."),
    taskStarted: taskEn("{{appName}} task started", "Task started", "{{appName}} has started processing {{taskName}}. We will keep you posted when it is completed, paused, or needs attention.", "Started at (UTC+0)", "{{startedAtUtc}}"),
    taskCompleted: taskEn("{{appName}} task completed", "Task completed", "Good news: {{taskName}} is complete. Open the Shopify App to review results, logs, and related details.", "Completed at (UTC+0)", "{{completedAtUtc}}"),
    taskPaused: taskEn("{{appName}} task paused", "Task paused", "{{taskName}} has been paused. While paused, it usually stops processing new data and generating related usage.", "Paused at (UTC+0)", "{{pausedAtUtc}}"),
    taskFailed: taskEn("{{appName}} task failed", "Task failed", "{{taskName}} could not be completed this time. Open the Shopify App to review the reason and check settings, authorization, credit balance, or third-party connections.", "Failed at (UTC+0)", "{{occurredAtUtc}}", [["Failure reason", "{{failureReason}}"]]),
  },
};

function subscriptionZh(subject, title, summary) {
  return {
    subject,
    title,
    preheader: "{{shopName}} 的订阅状态已更新，请查看套餐和积分账户信息。",
    greeting: "Hi {{recipientName}}，",
    paragraphs: [
      summary,
      "订阅状态会影响可用功能、自动任务、额度上限和账单周期。你可以打开 Shopify App 查看完整配置。",
      "如果这次变更涉及积分赠送、扣减或结转，积分账户会在处理完成后更新。最终余额以 Shopify App 内显示为准。",
      "积分可用于任务执行、额度消耗或其他按量功能。完整明细也会在 Shopify App 中展示。",
    ],
    details: [
      ...commonDetails.zh,
      ["原套餐", "{{previousPlanName}}"],
      ["当前套餐", "{{currentPlanName}}"],
      ["生效时间 (UTC+0)", "{{effectiveAtUtc}}"],
      ["计费周期", "{{billingPeriod}}"],
      ...creditDetails.zh,
    ],
    actionLabel: "前往 Shopify App 查看",
    actionUrl: reviewSafeAppUrl,
  };
}

function subscriptionEn(subject, title, summary) {
  return {
    subject,
    title,
    preheader: "{{shopName}} subscription status has been updated.",
    greeting: "Hi {{recipientName}},",
    paragraphs: [
      summary,
      "Subscription status can affect available features, automated tasks, usage limits, and billing cycles. Open the Shopify App to review the full setup.",
      "If this change includes granted, deducted, or carried-over credits, the credit account will update after processing. The final balance shown in the Shopify App is the source of truth.",
      "Credits can be used for task execution, usage quotas, and other metered features. The full history is available in the Shopify App.",
    ],
    details: [
      ...commonDetails.en,
      ["Previous plan", "{{previousPlanName}}"],
      ["Current plan", "{{currentPlanName}}"],
      ["Effective at (UTC+0)", "{{effectiveAtUtc}}"],
      ["Billing period", "{{billingPeriod}}"],
      ...creditDetails.en,
    ],
    actionLabel: "Open Shopify App",
    actionUrl: reviewSafeAppUrl,
  };
}

function taskZh(subject, title, summary, timeLabel, timeValue, extraDetails = []) {
  return {
    subject,
    title,
    preheader: "{{shopName}} 的任务状态已更新：{{taskName}}。",
    greeting: "Hi {{recipientName}}，",
    paragraphs: [
      summary,
      "任务状态可能与店铺数据同步、广告投放、物流处理、诊断分析或其他自动化流程有关。打开 Shopify App 可以看到更完整的上下文。",
      "如果任务涉及积分消耗或退回，积分账户会在状态确认后更新。任务日志和积分明细会一起帮助你了解这次变化。",
      "积分可用于任务执行、额度消耗或其他按量功能。完整明细会在 Shopify App 中展示。",
    ],
    details: [
      ...commonDetails.zh,
      ["任务名称", "{{taskName}}"],
      ["任务编号", "{{taskId}}"],
      [timeLabel, timeValue],
      ...extraDetails,
      ...creditDetails.zh,
    ],
    actionLabel: "前往 Shopify App 查看",
    actionUrl: reviewSafeAppUrl,
  };
}

function taskEn(subject, title, summary, timeLabel, timeValue, extraDetails = []) {
  return {
    subject,
    title,
    preheader: "{{shopName}} task status updated: {{taskName}}.",
    greeting: "Hi {{recipientName}},",
    paragraphs: [
      summary,
      "Task status may relate to store data sync, advertising operations, logistics processing, diagnostic analysis, or other automation flows. Open the Shopify App to see the full context.",
      "If the task involves credit consumption or refunding, the credit account will update after the task status is confirmed. Task logs and credit details together give you the full picture.",
      "Credits can be used for task execution, usage quotas, and other metered features. The full history is available in the Shopify App.",
    ],
    details: [
      ...commonDetails.en,
      ["Task name", "{{taskName}}"],
      ["Task ID", "{{taskId}}"],
      [timeLabel, timeValue],
      ...extraDetails,
      ...creditDetails.en,
    ],
    actionLabel: "Open Shopify App",
    actionUrl: reviewSafeAppUrl,
  };
}

function html(locale, template) {
  const rows = template.details
    .map(([label, value]) => `
        <tr>
          <td style="padding:9px 0;color:#52606d;font-size:14px;line-height:1.6;">${escapeHtml(label)}</td>
          <td style="padding:9px 0;color:#0f2b46;font-size:14px;font-weight:700;line-height:1.6;text-align:right;">${escapeHtml(value)}</td>
        </tr>`)
    .join("");

  const action = template.actionUrl
    ? `<p style="margin:0 0 18px;color:#0f2b46;font-size:15px;line-height:1.75;">${escapeHtml(actionHint(locale))}</p><p style="margin:0;"><a href="${template.actionUrl}" style="display:inline-block;background:#0f2b46;color:#ffffff;text-decoration:none;border-radius:25px;padding:12px 20px;font-size:15px;font-weight:700;">${escapeHtml(template.actionLabel)}</a></p>`
    : "";

  const footer =
    locale === "zh-CN"
      ? "这是一封与 {{appName}} 服务状态相关的功能通知邮件。我们会在安装、订阅、积分账户和任务执行等关键节点发送提醒，帮助您及时了解店铺里的 app 使用情况。如有疑问，请联系 {{supportEmail}}。"
      : "This is a functional notification about your {{appName}} service status. We send reminders for important installation, subscription, credit account, and task events so your team can stay informed. If you have questions, contact {{supportEmail}}.";

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(template.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#fafafa;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f2b46;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(template.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;padding:20px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;">
            <tr>
              <td align="center" style="padding:22px 40px 14px;background:#ffffff;">
                <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                  <tr>
                    <td>
                      <p style="margin:0 0 2px;color:#0f2b46;font-size:16px;font-weight:700;line-height:1.35;text-align:left;">{{appName}}</p>
                      <p style="margin:0;color:#52606d;font-size:12px;line-height:1.35;text-align:left;">{{brandName}}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 22px;background:#ffffff;">
                <h1 style="margin:0 0 22px;color:#0f2b46;font-size:30px;font-weight:500;line-height:1.35;">${escapeHtml(template.title)}</h1>
                <p style="margin:0 0 18px;color:#0f2b46;font-size:15px;line-height:1.75;">${escapeHtml(template.greeting)}</p>
                ${template.paragraphs
                  .map((paragraph) => `<p style="margin:0 0 16px;color:#0f2b46;font-size:15px;line-height:1.75;">${escapeHtml(paragraph)}</p>`)
                  .join("\n                ")}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px 24px;background:#f8f8f8;">
                <p style="margin:0 0 12px;color:#0f2b46;font-size:18px;font-weight:700;line-height:1.5;">${escapeHtml(detailsTitle(locale))}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${rows}
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
                      <p style="margin:0;color:#33475b;font-size:12px;font-weight:700;line-height:1.35;text-align:left;">{{appName}}</p>
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function actionHint(locale) {
  return locale === "zh-CN"
    ? "点击下方按钮，进入 Shopify App 查看完整详情。"
    : "Use the button below to open the Shopify App and review the full details.";
}

function detailsTitle(locale) {
  return locale === "zh-CN" ? "明细" : "Breakdown";
}

function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });

  for (const [locale, registry] of Object.entries(templates)) {
    const localeDir = path.join(outputRoot, locale);
    fs.mkdirSync(localeDir, { recursive: true });

    for (const [event, template] of Object.entries(registry)) {
      fs.writeFileSync(path.join(localeDir, `${event}.html`), html(locale, template));
    }
  }

  fs.writeFileSync(
    path.join(outputRoot, "README.md"),
    `# Tencent Cloud email HTML templates

These files are review-ready HTML templates for Tencent Cloud Email.

- Upload the required \`.html\` file as the email body.
- Tencent Cloud template variables use \`{{variableName}}\`.
- Keep the static text in the template. It is intentional and helps the platform identify the business scenario during review.
- When sending with the Tencent Cloud API, provide values through TemplateData using the same variable names.
`,
  );

  fs.writeFileSync(
    path.join(outputRoot, "VARIABLES.md"),
    `# Template variables

## Common variables

- \`shop_id\`: Shopify store identifier interpolated into the fixed app link \`https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email\`.
- \`path\`: Shopify app path segment interpolated into the fixed app link \`https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email\`.
- \`appName\`: App display name.
- \`brandName\`: Brand or company display name.
- \`recipientName\`: Recipient display name. Use a fallback value such as "商家" or "merchant" if no name is available.
- \`supportEmail\`: Support email address.
- \`shopName\`: Shopify shop name.
- \`shopDomain\`: Shopify shop domain, e.g. \`demo.myshopify.com\`.
- \`occurredAtUtc\`: Event time in UTC+0, for example \`2026-05-28 02:00 UTC\`.

## App lifecycle variables

- \`installedAtUtc\`: Installation time in UTC+0.
- \`uninstalledAtUtc\`: Uninstallation time in UTC+0.

## Purchase variables

- \`purchaseType\`: Localized purchase type, such as zh \`积分购买\` or en \`Credit pack\`.
- \`orderId\`: Payment or order identifier.
- \`planName\`: Plan, product, or credit package name.
- \`amountUsd\`: Formatted amount with \`$\` prefix only, for example \`$9.99\`.
- \`billingPeriod\`: Localized billing period.

## Subscription variables

- \`previousPlanName\`: Previous plan name.
- \`currentPlanName\`: Current plan name.
- \`effectiveAtUtc\`: Subscription effective time in UTC+0.
- \`billingPeriod\`: Billing period.

## Task variables

- \`taskName\`: Task display name.
- \`taskId\`: Task identifier.
- \`startedAtUtc\`: Task start time in UTC+0. Falls back to \`occurredAtUtc\` when not provided.
- \`completedAtUtc\`: Task completion time in UTC+0. Falls back to \`occurredAtUtc\` when not provided.
- \`pausedAtUtc\`: Task pause time in UTC+0. Falls back to \`occurredAtUtc\` when not provided.
- \`failureReason\`: Failure reason.

## Credit account variables

- \`creditsChanged\`: Credit amount changed by this event.
- \`creditsBefore\`: Credit balance before this event.
- \`creditsAfter\`: Credit balance after this event.
- \`creditUnit\`: Empty string in current billing emails.
- \`creditReason\`: Localized reason for the credit change.
`,
  );
}

main();
