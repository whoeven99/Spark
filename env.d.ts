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
  readonly SESSION_PRISMA_TABLE?: "session" | "generateDescriptionSession";
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
}
