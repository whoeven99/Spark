import { getEnv } from "./env.js";
import { isSparkDbConfigured } from "./db.js";
import { isTsfDbConfigured } from "./tsfDb.js";
import { isAdminOpsDbConfigured } from "./adminOpsDb.js";
import { isCosmosConfigured } from "./cosmos.js";
import { isBlobConfigured } from "./blob.js";
import { ADMIN_USERS } from "../middleware/auth.js";

const LOG = "[admin:env]";

function mask(key: string, value: string): string {
  const v = value.trim();
  if (!v) return "❌ 缺失";
  if (/TOKEN|SECRET|KEY|PASSWORD|CONNECTION_STRING/i.test(key)) {
    return `(已设置,len=${v.length})`;
  }
  if (v.length > 48) return `${v.slice(0, 48)}…`;
  return v;
}

function line(ok: boolean, label: string): void {
  console.info(`${LOG}   [${ok ? "✅" : "❌"}] ${label}`);
}

function field(key: string, value?: string): void {
  console.info(`${LOG}       ${key}=${value?.trim() ? mask(key, value) : "❌ 缺失"}`);
}

/** 启动时打印 Admin 现行主 key（不含已废弃兼容名） */
export function logAdminEnvStatus(): void {
  console.info(`${LOG} ===== 关键变量 =====`);

  const sparkOk = isSparkDbConfigured();
  line(sparkOk, "Spark Turso");
  field("SPARK_DATABASE_URL", getEnv("SPARK_DATABASE_URL") || undefined);
  field("SPARK_DATABASE_AUTH_TOKEN", getEnv("SPARK_DATABASE_AUTH_TOKEN") || undefined);

  const adminOpsOk = isAdminOpsDbConfigured();
  line(adminOpsOk, "Admin ops Turso");
  field("ADMIN_DATABASE_URL", getEnv("ADMIN_DATABASE_URL") || undefined);
  field("ADMIN_DATABASE_AUTH_TOKEN", getEnv("ADMIN_DATABASE_AUTH_TOKEN") || undefined);

  const tsfOk = isTsfDbConfigured();
  line(tsfOk, "TSF Turso");
  field("TSF_DATABASE_URL", getEnv("TSF_DATABASE_URL") || undefined);
  field("TSF_DATABASE_AUTH_TOKEN", getEnv("TSF_DATABASE_AUTH_TOKEN") || undefined);

  const cosmosOk = isCosmosConfigured();
  line(cosmosOk, "Cosmos");
  field("COSMOS_ENDPOINT", getEnv("COSMOS_ENDPOINT") || undefined);
  field("COSMOS_KEY", getEnv("COSMOS_KEY") || undefined);

  const blobOk = isBlobConfigured();
  line(blobOk, "Blob");
  field("AZURE_BLOB_CONNECTION_STRING", getEnv("AZURE_BLOB_CONNECTION_STRING") || undefined);

  const redisOk = Boolean(getEnv("RENDER_KV"));
  line(redisOk, "Redis");
  field("RENDER_KV", getEnv("RENDER_KV") || undefined);

  const authOk = ADMIN_USERS.every((u) => Boolean(getEnv(u.envKey)));
  line(authOk, "Admin auth (per-user)");
  for (const u of ADMIN_USERS) {
    field(u.envKey, getEnv(u.envKey) || undefined);
  }

  const sesOk = Boolean(
    (getEnv("TENCENT_CLOUD_KEY_ID") || getEnv("Tencent_Cloud_KEY_ID")) &&
      (getEnv("TENCENT_CLOUD_KEY") || getEnv("Tencent_Cloud_KEY")),
  );
  line(sesOk, "Tencent SES (ops email)");
  field("TENCENT_CLOUD_KEY_ID", getEnv("TENCENT_CLOUD_KEY_ID") || getEnv("Tencent_Cloud_KEY_ID") || undefined);
  field("SPARK_INSTALL_URL", getEnv("SPARK_INSTALL_URL") || undefined);
  field("EMAIL_TEST_RECIPIENT", getEnv("EMAIL_TEST_RECIPIENT") || undefined);

  console.info(`${LOG} =================`);
}
