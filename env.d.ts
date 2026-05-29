/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly TURSO_TEST_DATABASE_URL?: string;
  readonly TURSO_TEST_AUTH_TOKEN?: string;
  readonly TURSO_PROD_DATABASE_URL?: string;
  readonly TURSO_PROD_AUTH_TOKEN?: string;
  readonly TURSO_TARGET?: "test" | "prod";
  readonly APP_ENTRY?: string;
  readonly SESSION_PRISMA_TABLE?: "session" | "productImproveSession";
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
  /** 商户通知腾讯 SES 模板 ID 覆盖（默认见 notificationTemplateIds.server.ts） */
  readonly NOTIFICATION_TEMPLATE_ID_APP_INSTALLED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_APP_UNINSTALLED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_PURCHASE?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_STARTED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CHANGED?: string;
  readonly NOTIFICATION_TEMPLATE_ID_SUBSCRIPTION_CANCELED?: string;
  readonly NOTIFICATION_APP_NAME?: string;
  readonly NOTIFICATION_BRAND_NAME?: string;
  readonly NOTIFICATION_APP_ICON_URL?: string;
  readonly NOTIFICATION_HELP_CENTER_URL?: string;
  readonly NOTIFICATION_LEGAL_NAME?: string;
  /** 飞书运营通知总开关；false 关闭全部 channel（默认 true） */
  readonly FEISHU_ENABLED?: string;
  /** 卸载飞书群机器人 Webhook；未设则跳过 */
  readonly FEISHU_WEBHOOK_URL_UNINSTALL?: string;
  /** 订阅生效飞书群机器人 Webhook；未设则跳过 */
  readonly FEISHU_WEBHOOK_URL_SUBSCRIPTION?: string;
  /** Partner API Access Token；用于卸载时读取 RelationshipUninstalled 原因/反馈；未设则飞书显示「未提供」 */
  readonly SHOPIFY_PARTNER_API_TOKEN?: string;
  /** Partner Dashboard 组织 ID（URL 中 partners.shopify.com/{id}/...）；未设则跳过 Partner 查询 */
  readonly SHOPIFY_PARTNER_ORGANIZATION_ID?: string;
  /** Partner App ID（Dev Dashboard URL 中 /apps/{id}/ 或 gid://partners/App/{id}）；未设则跳过 Partner 查询 */
  readonly SHOPIFY_PARTNER_APP_ID?: string;
}
