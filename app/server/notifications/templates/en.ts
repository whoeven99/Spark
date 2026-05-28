import type {
  NotificationTemplateRegistry,
  TemplateDisplay,
  TemplateRow,
} from "./sharedLayout";
import type {
  CreditAccountChange,
  SubscriptionNotificationVariables,
  TaskNotificationVariables,
} from "../types";
import { commonRows, creditRows } from "./sharedLayout";

const labels = {
  shopName: "Shop name",
  shopDomain: "Shop domain",
  occurredAtUtc: "Time (UTC+0)",
  changed: "Credit change",
  before: "Balance before",
  after: "Balance after",
  reason: "Credit note",
};

export const enTemplates: NotificationTemplateRegistry = {
  appInstalled: ({ variables, display }) => ({
    subject: `${display.appName} has been installed`,
    preheader: `${display.appName} is now connected to ${variables.shopName}.`,
    title: `${display.appName} has been installed`,
    greeting: variables.recipientName ? `Hi ,` : "Hi,",
    paragraphs: [
      `${display.appName} is now connected to ${variables.shopName}. Open the Shopify App to finish setup and start using the available features.`,
      "From here, we will send short updates when installation, subscription, credit, or task status changes. That way, your team can stay aligned without checking manually.",
      "If this installation was not made by you or your team, review your Shopify app activity and confirm that store access is still secure.",
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "Installed at (UTC+0)", value: variables.installedAtUtc },
    ],
    action: { label: "Open Shopify App", url: display.dashboardUrl },
  }),

  appUninstalled: ({ variables, display }) => ({
    subject: `${display.appName} has been uninstalled`,
    preheader: `${display.appName} is no longer connected to ${variables.shopName}.`,
    title: `${display.appName} has been uninstalled`,
    greeting: variables.recipientName ? `Hi ,` : "Hi,",
    paragraphs: [
      `${display.appName} has been uninstalled from ${variables.shopName}. Related automated tasks will stop, and the app will no longer access data for this store.`,
      "If this was expected, no further action is needed. If you are not sure who made the change, review the app activity in Shopify.",
      "Billing, task, and credit account records may be kept for a limited time to support reconciliation and customer support.",
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "Uninstalled at (UTC+0)", value: variables.uninstalledAtUtc },
    ],
    action: { label: "View Shopify App status", url: display.dashboardUrl },
  }),

  purchaseCreated: ({ variables, display }) => ({
    subject: `${display.appName} purchase record created`,
    preheader: `A purchase or credit transaction has been recorded for ${variables.shopName}.`,
    title: "Purchase record created",
    greeting: variables.recipientName ? `Hi ,` : "Hi,",
    paragraphs: [
      `${display.appName} recorded a purchase, subscription, or credit top-up. Here is the breakdown for your billing records.`,
      "If credits are included, the balance will update after payment confirmation or system processing. There may be a short delay depending on the payment channel, and the Shopify App balance is the source of truth.",
      "If you did not make this purchase, or if the amount, plan, or credit change looks off, keep this email and contact us. We will help check it using the shop, order, and event time.",
      ...creditParagraph(variables.creditAccountChange),
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "Purchase type", value: purchaseTypeLabel(variables.purchaseType) },
      { label: "Order ID", value: variables.orderId },
      { label: "Plan or item", value: variables.planName },
      { label: "Amount (USD)", value: formatUsdAmount(variables.amountUsd) },
      { label: "Billing period", value: variables.billingPeriod },
      ...creditRows(variables.creditAccountChange, labels),
    ],
    action: { label: "Open Shopify App", url: display.dashboardUrl },
  }),

  subscriptionStarted: ({ variables, display }) => subscriptionContent({
    subject: `${display.appName} subscription started`,
    title: "Subscription started",
    summary: `${display.appName} is now active. Here is a quick breakdown of the current plan, billing period, and credit account.`,
    variables,
    display,
  }),

  subscriptionChanged: ({ variables, display }) => subscriptionContent({
    subject: `${display.appName} subscription changed`,
    title: "Subscription changed",
    summary: `${display.appName} has been updated. The plan, timing, and any related credit changes are listed below.`,
    variables,
    display,
  }),

  subscriptionCanceled: ({ variables, display }) => subscriptionContent({
    subject: `${display.appName} subscription canceled`,
    title: "Subscription canceled",
    summary: `${display.appName} has been canceled. Some premium features, automated tasks, or usage quotas may stop after the current billing period ends.`,
    variables,
    display,
  }),

  taskStarted: ({ variables, display }) => taskContent({
    subject: `${display.appName} task started`,
    title: "Task started",
    summary: `${display.appName} has started processing ${variables.taskName}. We will keep you posted when it is completed, paused, or needs attention.`,
    variables,
    display,
    timeLabel: "Started at (UTC+0)",
    timeValue: variables.startedAtUtc,
  }),

  taskCompleted: ({ variables, display }) => taskContent({
    subject: `${display.appName} task completed`,
    title: "Task completed",
    summary: `Good news: ${variables.taskName} is complete. Open the Shopify App to review results, logs, and related details.`,
    variables,
    display,
    timeLabel: "Completed at (UTC+0)",
    timeValue: variables.completedAtUtc,
  }),

  taskPaused: ({ variables, display }) => taskContent({
    subject: `${display.appName} task paused`,
    title: "Task paused",
    summary: `${variables.taskName} has been paused. While paused, it usually stops processing new data and generating related usage.`,
    variables,
    display,
    timeLabel: "Paused at (UTC+0)",
    timeValue: variables.pausedAtUtc,
  }),

  taskFailed: ({ variables, display }) => taskContent({
    subject: `${display.appName} task failed`,
    title: "Task failed",
    summary: `${variables.taskName} could not be completed this time. Open the Shopify App to review the reason and check settings, authorization, credit balance, or third-party connections.`,
    variables,
    display,
    timeLabel: "Failed at (UTC+0)",
    timeValue: variables.occurredAtUtc,
    extraRows: [{ label: "Failure reason", value: variables.failureReason }],
  }),
};

function subscriptionContent({
  subject,
  title,
  summary,
  variables,
  display,
}: {
  subject: string;
  title: string;
  summary: string;
  variables: SubscriptionNotificationVariables;
  display: TemplateDisplay;
}) {
  return {
    subject,
    preheader: `${variables.shopName} subscription status has been updated.`,
    title,
    greeting: variables.recipientName ? `Hi ,` : "Hi,",
    paragraphs: [
      summary,
      "Subscription status can affect available features, automated tasks, usage limits, and billing cycles. Open the Shopify App to review the full setup.",
      "If this change includes granted, deducted, or carried-over credits, the credit account will update after processing. The final balance shown in the Shopify App is the source of truth.",
      ...creditParagraph(variables.creditAccountChange),
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "Previous plan", value: variables.previousPlanName },
      { label: "Current plan", value: variables.currentPlanName },
      { label: "Effective at (UTC+0)", value: variables.effectiveAtUtc },
      { label: "Billing period", value: variables.billingPeriod },
      ...creditRows(variables.creditAccountChange, labels),
    ],
    action: { label: "Open Shopify App", url: display.dashboardUrl },
  };
}

function taskContent({
  subject,
  title,
  summary,
  variables,
  display,
  timeLabel,
  timeValue,
  extraRows = [],
}: {
  subject: string;
  title: string;
  summary: string;
  variables: TaskNotificationVariables;
  display: TemplateDisplay;
  timeLabel: string;
  timeValue?: string;
  extraRows?: TemplateRow[];
}) {
  return {
    subject,
    preheader: `${variables.shopName} task status updated: ${variables.taskName}.`,
    title,
    greeting: variables.recipientName ? `Hi ,` : "Hi,",
    paragraphs: [
      summary,
      "Task status may relate to store data sync, advertising operations, logistics processing, diagnostic analysis, or other automation flows. Open the Shopify App to see the full context.",
      "If the task involves credit consumption or refunding, the credit account will update after the task status is confirmed. Task logs and credit details together will give you the full picture.",
      ...creditParagraph(variables.creditAccountChange),
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "Task name", value: variables.taskName },
      { label: "Task type", value: variables.taskType },
      { label: "Task ID", value: variables.taskId },
      { label: timeLabel, value: timeValue },
      ...extraRows,
      ...creditRows(variables.creditAccountChange, labels),
    ],
    action: { label: "Open Shopify App", url: variables.statusUrl ?? display.dashboardUrl },
  };
}

function creditParagraph(change: CreditAccountChange | undefined): string[] {
  if (!change) {
    return [];
  }

  return ["Credits can be used for task execution, usage quotas, and other metered features. The full history is available in the Shopify App."];
}

function purchaseTypeLabel(type: "subscription" | "creditPack" | "oneTime" | undefined): string | undefined {
  if (type === "subscription") return "Subscription";
  if (type === "creditPack") return "Credit purchase";
  if (type === "oneTime") return "One-time purchase";
  return undefined;
}

function formatUsdAmount(amountUsd: string | undefined): string | undefined {
  if (!amountUsd) {
    return undefined;
  }

  return `USD ${amountUsd}`;
}
