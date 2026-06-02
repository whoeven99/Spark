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
import { commonRows, creditRows, REVIEW_SAFE_APP_URL } from "./sharedLayout";

const labels = {
  shopName: "店铺名称",
  shopDomain: "店铺域名",
  occurredAtUtc: "发生时间 (UTC+0)",
  changed: "积分变动",
  before: "变动前余额",
  after: "变动后余额",
  reason: "积分说明",
};

export const zhCNTemplates: NotificationTemplateRegistry = {
  appInstalled: ({ variables, display }) => ({
    subject: `${display.appName} 已成功安装`,
    preheader: `${display.appName} 已连接到 ${variables.shopName}，您可以开始使用相关功能。`,
    title: `${display.appName} 已成功安装`,
    greeting: variables.recipientName ? `Hi ，` : "Hi，",
    paragraphs: [
      `${display.appName} 已经连接到 ${variables.shopName}。你可以打开 Shopify App 完成设置，并开始使用相关功能。`,
      "接下来，我们会在安装、订阅、积分和任务状态发生变化时发来简短提醒。这样你不用反复检查，也能及时了解 app 的运行情况。",
      "如果这次安装不是你或团队成员操作的，建议回到 Shopify 后台看一下应用记录，确认店铺权限仍然安全。",
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "安装时间 (UTC+0)", value: variables.installedAtUtc ?? variables.occurredAtUtc },
    ],
    action: { label: "前往 Shopify App 查看", url: REVIEW_SAFE_APP_URL },
  }),

  appUninstalled: ({ variables, display }) => ({
    subject: `${display.appName} 已从店铺卸载`,
    preheader: `${display.appName} 已不再连接到 ${variables.shopName}。`,
    title: `${display.appName} 已从店铺卸载`,
    greeting: variables.recipientName ? `Hi ，` : "Hi，",
    paragraphs: [
      `${display.appName} 已从 ${variables.shopName} 卸载。相关自动任务会停止，app 也不会继续访问这家店铺的数据。`,
      "如果这是计划内操作，就不用再处理了。若你不确定是谁卸载的，可以先查看 Shopify 后台的应用记录。",
      "账单、任务和积分账户的必要记录可能会保留一段时间，方便后续对账或客户支持。",
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "卸载时间 (UTC+0)", value: variables.uninstalledAtUtc ?? variables.occurredAtUtc },
    ],
    action: { label: "查看 Shopify App 状态", url: REVIEW_SAFE_APP_URL },
  }),

  purchaseCreated: ({ variables, display }) => ({
    subject: `${display.appName} 购买记录已生成`,
    preheader: `${variables.shopName} 的购买或充值记录已生成，请查看订单和积分账户信息。`,
    title: "购买记录已生成",
    greeting: variables.recipientName ? `Hi ，` : "Hi，",
    paragraphs: [
      `${display.appName} 已记录一笔购买、订阅或积分充值。下面是这次变动的明细，方便你留存和对账。`,
      "如果这次购买包含积分，余额会在支付确认或处理完成后更新。不同支付渠道可能会有短暂延迟，最终结果以 Shopify App 内显示为准。",
      "如果你没有发起这次购买，或对金额、套餐、积分变动有疑问，可以保留这封邮件并联系我们。我们会根据店铺、订单和时间帮你核对。",
      ...creditParagraph(variables.creditAccountChange),
    ],
    details: [
      ...commonRows(variables, labels),
      { label: labels.occurredAtUtc, value: variables.occurredAtUtc },
      { label: "订单编号", value: variables.orderId },
      { label: "套餐或项目", value: variables.planName },
      { label: "金额 (USD)", value: formatUsdAmount(variables.amountUsd) },
      { label: "计费周期", value: variables.billingPeriod },
      ...creditRows(variables.creditAccountChange, labels),
    ],
    action: { label: "前往 Shopify App 查看", url: REVIEW_SAFE_APP_URL },
  }),

  subscriptionStarted: ({ variables, display }) => subscriptionContent({
    subject: `${display.appName} 订阅已开始`,
    title: "订阅已开始",
    summary: `${display.appName} 订阅已经生效。这里是当前套餐、计费周期和积分账户的简要明细。`,
    variables,
    display,
  }),

  subscriptionChanged: ({ variables, display }) => subscriptionContent({
    subject: `${display.appName} 订阅已变更`,
    title: "订阅已变更",
    summary: `${display.appName} 订阅已更新。下面是这次变更的明细，方便你快速核对。`,
    variables,
    display,
  }),

  subscriptionCanceled: ({ variables, display }) => subscriptionContent({
    subject: `${display.appName} 订阅已取消`,
    title: "订阅已取消",
    summary: `${display.appName} 订阅已取消。当前账期结束后，部分高级能力、自动任务或额度可能会停止。`,
    variables,
    display,
  }),

  taskStarted: ({ variables, display }) => taskContent({
    subject: `${display.appName} 任务已开始`,
    title: "任务已开始",
    summary: `${display.appName} 已开始处理 ${variables.taskName}。我们会在任务完成、暂停或需要你查看时继续同步状态。`,
    variables,
    display,
    timeLabel: "开始时间 (UTC+0)",
    timeValue: variables.startedAtUtc,
  }),

  taskCompleted: ({ variables, display }) => taskContent({
    subject: `${display.appName} 任务已完成`,
    title: "任务已完成",
    summary: `好消息，${variables.taskName} 已经处理完成。你可以前往 Shopify App 查看结果、日志和相关明细。`,
    variables,
    display,
    timeLabel: "完成时间 (UTC+0)",
    timeValue: variables.completedAtUtc,
  }),

  taskPaused: ({ variables, display }) => taskContent({
    subject: `${display.appName} 任务已暂停`,
    title: "任务已暂停",
    summary: `${variables.taskName} 已暂停。暂停期间，任务通常不会继续处理新数据，也不会继续产生相关消耗。`,
    variables,
    display,
    timeLabel: "暂停时间 (UTC+0)",
    timeValue: variables.pausedAtUtc,
  }),

  taskFailed: ({ variables, display }) => taskContent({
    subject: `${display.appName} 任务执行失败`,
    title: "任务执行失败",
    summary: `很抱歉，您在 ${display.appName} 中配置的任务这次没有完成。建议您进入 Shopify App 查看失败原因，并检查配置、授权、积分余额或第三方连接状态。`,
    variables,
    display,
    timeLabel: "失败时间 (UTC+0)",
    timeValue: variables.occurredAtUtc,
    extraRows: [{ label: "失败原因", value: variables.failureReason }],
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
    preheader: `${variables.shopName} 的订阅状态已更新，请查看套餐和积分账户信息。`,
    title,
    greeting: variables.recipientName ? `Hi ，` : "Hi，",
    paragraphs: [
      summary,
      "订阅状态会影响可用功能、自动任务、额度上限和账单周期。你可以打开 Shopify App 查看完整配置。",
      "如果这次变更涉及积分赠送、扣减或结转，积分账户会在处理完成后更新。最终余额以 Shopify App 内显示为准。",
      ...creditParagraph(variables.creditAccountChange),
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "原套餐", value: variables.previousPlanName },
      { label: "当前套餐", value: variables.currentPlanName },
      { label: "生效时间 (UTC+0)", value: variables.effectiveAtUtc ?? variables.occurredAtUtc },
      { label: "计费周期", value: variables.billingPeriod },
      ...creditRows(variables.creditAccountChange, labels),
    ],
    action: { label: "前往 Shopify App 查看", url: REVIEW_SAFE_APP_URL },
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
    preheader: `${variables.shopName} 的任务状态已更新：${variables.taskName}。`,
    title,
    greeting: variables.recipientName ? `Hi ，` : "Hi，",
    paragraphs: [
      summary,
      "任务状态可能与店铺数据同步、广告投放、物流处理、诊断分析或其他自动化流程有关。打开 Shopify App 可以看到更完整的上下文。",
      "如果任务涉及积分消耗或退回，积分账户会在状态确认后更新。任务日志和积分明细会一起帮助你了解这次变化。",
      ...creditParagraph(variables.creditAccountChange),
    ],
    details: [
      ...commonRows(variables, labels),
      { label: "任务名称", value: variables.taskName },
      { label: "任务编号", value: variables.taskId },
      { label: timeLabel, value: timeValue ?? variables.occurredAtUtc },
      ...extraRows,
      ...creditRows(variables.creditAccountChange, labels),
    ],
    action: { label: "前往 Shopify App 查看", url: REVIEW_SAFE_APP_URL },
  };
}

function creditParagraph(change: CreditAccountChange | undefined): string[] {
  if (!change) {
    return [];
  }

  return ["积分可用于任务执行、额度消耗或其他按量功能。完整明细会在 Shopify App 中展示。"];
}

function formatUsdAmount(amountUsd: string | undefined): string | undefined {
  if (!amountUsd) {
    return undefined;
  }

  return `USD ${amountUsd}`;
}
