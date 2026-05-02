/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly TURSO_TEST_DATABASE_URL?: string;
  readonly TURSO_TEST_AUTH_TOKEN?: string;
  readonly TURSO_PROD_DATABASE_URL?: string;
  readonly TURSO_PROD_AUTH_TOKEN?: string;
  readonly TURSO_TARGET?: "test" | "prod";
}
