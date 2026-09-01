import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpsEmailTemplate } from "./types.js";

const CTA_HREF =
  "https://admin.shopify.com/store/{{shop_id}}/apps/{{path}}?utm=email";

export const OPS_EMAIL_CTA_HREF = CTA_HREF;

const TEMPLATES: OpsEmailTemplate[] = [
  {
    key: "appInstalled-zh",
    templateId: 180498,
    event: "appInstalled",
    locale: "zh-CN",
    label: "安装成功 · 中文",
    subject: "🎉 安装成功！马上开始体验吧 | {{appName}}",
    htmlFile: "zh-CN/appInstalled.html",
  },
  {
    key: "appInstalled-en",
    templateId: 184217,
    event: "appInstalled",
    locale: "en",
    label: "Installed · English",
    subject: "🎉 Successfully installed! Start exploring now | {{appName}}",
    htmlFile: "en/appInstalled.html",
  },
  {
    key: "appUninstalled-zh",
    templateId: 180499,
    event: "appUninstalled",
    locale: "zh-CN",
    label: "卸载通知 · 中文",
    subject: "🔌 你的店铺已断开连接 | {{appName}}",
    htmlFile: "zh-CN/appUninstalled.html",
  },
  {
    key: "appUninstalled-en",
    templateId: 184219,
    event: "appUninstalled",
    locale: "en",
    label: "Uninstalled · English",
    subject: "🔌 Your store has been disconnected | {{appName}}",
    htmlFile: "en/appUninstalled.html",
  },
  {
    key: "purchaseCreated-zh",
    templateId: 180500,
    event: "purchaseCreated",
    locale: "zh-CN",
    label: "购包成功 · 中文",
    subject: "🎉 支付成功！已为你确认订单 | {{appName}}",
    htmlFile: "zh-CN/purchaseCreated.html",
  },
  {
    key: "purchaseCreated-en",
    templateId: 184220,
    event: "purchaseCreated",
    locale: "en",
    label: "Purchase · English",
    subject: "🎉 Payment successful! Your order is confirmed | {{appName}}",
    htmlFile: "en/purchaseCreated.html",
  },
  {
    key: "subscriptionCanceled-zh",
    templateId: 180501,
    event: "subscriptionCanceled",
    locale: "zh-CN",
    label: "订阅取消 · 中文",
    subject: "🧾 你的订阅已取消 | {{appName}}",
    htmlFile: "zh-CN/subscriptionCanceled.html",
  },
  {
    key: "subscriptionCanceled-en",
    templateId: 184221,
    event: "subscriptionCanceled",
    locale: "en",
    label: "Subscription canceled · English",
    subject: "🧾 Your subscription has been canceled | {{appName}}",
    htmlFile: "en/subscriptionCanceled.html",
  },
  {
    key: "subscriptionChanged-zh",
    templateId: 180502,
    event: "subscriptionChanged",
    locale: "zh-CN",
    label: "套餐变更 · 中文",
    subject: "🔄 你的套餐已更新 | {{appName}}",
    htmlFile: "zh-CN/subscriptionChanged.html",
  },
  {
    key: "subscriptionChanged-en",
    templateId: 184222,
    event: "subscriptionChanged",
    locale: "en",
    label: "Plan changed · English",
    subject: "🔄 Your plan has been updated | {{appName}}",
    htmlFile: "en/subscriptionChanged.html",
  },
  {
    key: "subscriptionStarted-zh",
    templateId: 180503,
    event: "subscriptionStarted",
    locale: "zh-CN",
    label: "订阅生效 · 中文",
    subject: "🎊 订阅成功！你的权益已生效 | {{appName}}",
    htmlFile: "zh-CN/subscriptionStarted.html",
  },
  {
    key: "subscriptionStarted-en",
    templateId: 184223,
    event: "subscriptionStarted",
    locale: "en",
    label: "Subscription started · English",
    subject: "🎊 Subscription activated! Your benefits are now live | {{appName}}",
    htmlFile: "en/subscriptionStarted.html",
  },
  {
    key: "taskCompleted-zh",
    templateId: 180504,
    event: "taskCompleted",
    locale: "zh-CN",
    label: "任务完成 · 中文",
    subject: "✅ 你创建的任务已完成 | {{appName}}",
    htmlFile: "zh-CN/taskCompleted.html",
  },
  {
    key: "taskCompleted-en",
    templateId: 180504,
    event: "taskCompleted",
    locale: "en",
    label: "Task completed · English",
    subject: "✅ Your task is complete | {{appName}}",
    htmlFile: "en/taskCompleted.html",
  },
  {
    key: "taskPaused-zh",
    templateId: 180506,
    event: "taskPaused",
    locale: "zh-CN",
    label: "任务暂停 · 中文",
    subject: "⚠️ 你创建的任务可能遇到了麻烦 | {{appName}}",
    htmlFile: "zh-CN/taskPaused.html",
  },
  {
    key: "taskPaused-en",
    templateId: 180506,
    event: "taskPaused",
    locale: "en",
    label: "Task paused · English",
    subject: "⚠️ Your task may have run into an issue | {{appName}}",
    htmlFile: "en/taskPaused.html",
  },
  {
    key: "taskFailed-zh",
    templateId: 180506,
    event: "taskFailed",
    locale: "zh-CN",
    label: "任务失败 · 中文",
    subject: "⚠️ 你创建的任务可能遇到了麻烦 | {{appName}}",
    htmlFile: "zh-CN/taskFailed.html",
  },
  {
    key: "taskFailed-en",
    templateId: 180506,
    event: "taskFailed",
    locale: "en",
    label: "Task failed · English",
    subject: "⚠️ Your task may have run into an issue | {{appName}}",
    htmlFile: "en/taskFailed.html",
  },
  {
    key: "taskStarted-zh",
    templateId: 180507,
    event: "taskStarted",
    locale: "zh-CN",
    label: "任务开始 · 中文",
    subject: "⏳ 你创建的任务已开始执行 | {{appName}}",
    htmlFile: "zh-CN/taskStarted.html",
  },
  {
    key: "taskStarted-en",
    templateId: 180507,
    event: "taskStarted",
    locale: "en",
    label: "Task started · English",
    subject: "⏳ Your task has started | {{appName}}",
    htmlFile: "en/taskStarted.html",
  },
];

export function listOpsEmailTemplates(): OpsEmailTemplate[] {
  return TEMPLATES;
}

export function getOpsEmailTemplate(key: string): OpsEmailTemplate | null {
  return TEMPLATES.find((item) => item.key === key) ?? null;
}

export function resolveTencentHtmlRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "../app/server/notifications/tencent-cloud-html"),
    path.resolve(process.cwd(), "app/server/notifications/tencent-cloud-html"),
    path.resolve(here, "../../../../app/server/notifications/tencent-cloud-html"),
    path.resolve(here, "../../../../../app/server/notifications/tencent-cloud-html"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error("未找到 app/server/notifications/tencent-cloud-html");
}
