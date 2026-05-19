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
  /** Partner API：拉取卸载原因（可选） */
  readonly SHOPIFY_PARTNER_ORG_ID?: string;
  readonly SHOPIFY_PARTNER_APP_GID?: string;
  readonly SHOPIFY_PARTNER_API_TOKEN?: string;
  readonly SHOPIFY_CLI_PARTNERS_TOKEN?: string;
  readonly SHOPIFY_PARTNER_API_VERSION?: string;
}
