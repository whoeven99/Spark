/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  /** Spark 业务库；测/产由各部署环境各自配值 */
  readonly TURSO_DATABASE_URL?: string;
  readonly TURSO_AUTH_TOKEN?: string;
  /** noop | shopify（默认 shopify） */
  readonly BILLING_GATEWAY?: string;
  readonly BILLING_TEST?: string;
  /** true 强制显示计费页取消订阅；false 强制隐藏 */
  readonly BILLING_DEV_CANCEL?: string;
  readonly EMAIL_PROVIDER?: string;
  readonly EMAIL_ENABLED?: string;
  readonly TENCENT_CLOUD_KEY_ID?: string;
  readonly TENCENT_CLOUD_KEY?: string;
  readonly TENCENT_SES_REGION?: string;
  readonly TENCENT_FROM_EMAIL?: string;
  readonly TENCENT_SES_CC?: string;
  readonly EMAIL_SEND_TIMEOUT_MS?: string;
  readonly EMAIL_SEND_MAX_RETRIES?: string;
  /** 运营通知收件人（To）兜底 */
  readonly OPS_NOTIFY_EMAIL?: string;
  /** 测试用：设置后全部邮件 To 重定向到该地址（含 Session 店主邮箱与 AI 工具指定收件人） */
  readonly EMAIL_TEST_RECIPIENT?: string;
  /** 商户通知腾讯 SES 模板 ID 覆盖（默认见 notificationTemplateIds.server.ts） */
  readonly NOTIFICATION_TEMPLATE_ID_APP_INSTALLED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_APP_UNINSTALLED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_PURCHASE?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_STARTED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CHANGED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CANCELED?: string;
  /** 英文腾讯 SES 模板 ID（未配置时 fallback 中文模板） */
  readonly NOTIFICATION_TEMPLATE_ID_APP_INSTALLED_EN?: string;
  readonly NOTIFICATION_TEMPLATE_ID_APP_UNINSTALLED_EN?: string;
  readonly NOTIFICATION_TEMPLATE_ID_PURCHASE_EN?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_STARTED_EN?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CHANGED_EN?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CANCELED_EN?: string;
  /** 商户通知默认语言：zh-CN | en */
  readonly NOTIFICATION_DEFAULT_LOCALE?: string;
  readonly NOTIFICATION_APP_NAME?: string;
  readonly NOTIFICATION_BRAND_NAME?: string;
  readonly NOTIFICATION_APP_ICON_URL?: string;
  readonly NOTIFICATION_HELP_CENTER_URL?: string;
  readonly NOTIFICATION_LEGAL_NAME?: string;
  /** 飞书运营通知总开关；false 关闭全部 channel（默认 true） */
  readonly FEISHU_ENABLED?: string;
  /** 飞书运营通知 Webhook（卸载 / 订阅购包 / 客服消息统一）；未设则跳过 */
  readonly FEISHU_WEBHOOK_URL_SUPPORT?: string;
  /** Partner API Access Token；用于卸载时读取 RelationshipUninstalled 原因/反馈；未设则飞书显示「未提供」 */
  readonly SHOPIFY_PARTNER_API_TOKEN?: string;
  /** Partner Dashboard 组织 ID（URL 中 partners.shopify.com/{id}/...）；未设则跳过 Partner 查询 */
  readonly SHOPIFY_PARTNER_ORGANIZATION_ID?: string;
  /** Partner App ID（Dev Dashboard URL 中 /apps/{id}/ 或 gid://partners/App/{id}）；未设则跳过 Partner 查询 */
  readonly SHOPIFY_PARTNER_APP_ID?: string;
}
