import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProductionNodeEnv } from "./nodeEnv.server";

const ENV_LOG = "[spark:env]";

/** 去掉首尾空白与成对引号（Render 控制台偶发带入） */
export function normalizeEnvValue(value: string | undefined): string {
  if (value == null) return "";
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

let runtimeEnvLoaded = false;

/**
 * Vitest 下不加载仓库 `.env`：否则单测会拿到真实 Turso/Cosmos/Blob 凭证并打线上，
 * 表现为并行跑时的间歇超时。显式 `ENV_FILE` 仍然生效，供环境加载自身的用例使用。
 */
function isVitestRuntime(): boolean {
  return Boolean(process.env.VITEST);
}

/** 仓库根目录（含 package.json），不依赖 process.cwd() */
export function getProjectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

/** 仅测试用：允许重复执行 ensureRuntimeEnv */
export function resetRuntimeEnvLoaderForTests(): void {
  runtimeEnvLoaded = false;
}

/** Shopify CLI 在 `shopify app dev` 时注入；本地 .env 不应覆盖（多 App toml 切换） */
const PRESERVE_WHEN_SET_KEYS = new Set([
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "HOST",
  "PORT",
  "FRONTEND_PORT",
  "SCOPES",
]);

/**
 * 解析 KEY=VALUE 行。
 * @param overrideExisting 本地 .env 为 true：用文件值覆盖空字符串；Render 密钥文件为 false。
 */
function maskValue(key: string, value: string): string {
  if (!value) return "(空)";
  if (/token|secret|key|password|auth/i.test(key)) {
    return `(已设置,len=${value.length})`;
  }
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

function applyEnvFileContent(
  content: string,
  overrideExisting: boolean,
): { appliedCount: number; skipped: string[] } {
  let appliedCount = 0;
  const skipped: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const existing = process.env[key];
    const alreadySet = existing !== undefined && existing !== "";
    const preserveCliValue = alreadySet && PRESERVE_WHEN_SET_KEYS.has(key);
    const shouldApply =
      !preserveCliValue &&
      (existing === undefined ||
        existing === "" ||
        (overrideExisting && !process.env.RENDER));
    if (shouldApply) {
      process.env[key] = value;
      appliedCount += 1;
    } else if (alreadySet) {
      skipped.push(key);
    }
  }
  return { appliedCount, skipped };
}

function tryLoadEnvFile(filePath: string, overrideExisting: boolean): number {
  const exists = existsSync(filePath);
  console.info(`${ENV_LOG} 检查 ${filePath}: ${exists ? "存在" : "不存在"}`);
  if (!exists) return 0;
  try {
    const content = readFileSync(filePath, "utf8");
    const { appliedCount, skipped } = applyEnvFileContent(content, overrideExisting);
    if (skipped.length > 0) {
      console.info(`${ENV_LOG} 跳过 ${skipped.length} 个已有键: ${skipped.join(", ")}`);
    }
    return appliedCount;
  } catch (error) {
    console.warn(`${ENV_LOG} 读取 ${filePath} 失败:`, error);
    return 0;
  }
}

function candidateEnvFiles(projectRoot: string): string[] {
  const rootEnv = path.join(projectRoot, ".env");
  const fromEnv = [
    process.env.ENV_FILE,
    process.env.DOTENV_PATH,
    process.env.ENV_FILE_PATH,
  ]
    .filter((p): p is string => Boolean(p?.trim()))
    .map((p) => path.resolve(p.trim()));

  const secretPaths = [
    "/etc/secrets/.env",
    "/etc/secrets/env",
    "/var/secrets/.env",
  ];

  const cwdEnv = path.join(process.cwd(), ".env");

  // 测试只允许显式指定的文件，隔离掉真实凭证来源。
  if (isVitestRuntime()) return [...new Set(fromEnv)];

  // 去重，保持顺序：仓库 .env 优先
  const ordered = [rootEnv, ...fromEnv, cwdEnv, ...secretPaths];
  return [...new Set(ordered)];
}

/**
 * 启动时加载 .env（本地）与 Render Secret File。
 * 会合并多个文件，不再「读到第一个就 break」。
 */
type EnvField = [key: string, value: string | undefined, defaultValue?: string];

function formatEnvField([key, value, defaultValue]: EnvField): string {
  if (value?.trim()) return `${key}=${maskValue(key, value)}`;
  if (defaultValue) return `${key}=(默认 ${defaultValue})`;
  return `${key}=❌ 缺失`;
}

function logEnvCheck(service: string, ok: boolean, fields: EnvField[]): void {
  console.info(`${ENV_LOG}   [${ok ? "✅" : "❌"}] ${service}`);
  for (const field of fields) {
    console.info(`${ENV_LOG}       ${formatEnvField(field)}`);
  }
}

function tursoPairOk(urlKey: string, tokenKey: string): boolean {
  return Boolean(process.env[urlKey]?.trim() && process.env[tokenKey]?.trim());
}

/** 排错：按服务分组打印关键环境变量（与 worker ensureWorkerEnv 同风格） */
function logCriticalEnvStatus(): void {
  console.info(`${ENV_LOG} ===== 关键变量 =====`);

  const tursoOk = tursoPairOk("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN");
  logEnvCheck("Turso", tursoOk, [
    ["TURSO_DATABASE_URL", process.env.TURSO_DATABASE_URL],
    ["TURSO_AUTH_TOKEN", process.env.TURSO_AUTH_TOKEN],
  ]);

  logEnvCheck(
    "Shopify",
    Boolean(process.env.SHOPIFY_API_KEY?.trim() && process.env.SHOPIFY_API_SECRET?.trim()),
    [
      ["SHOPIFY_API_KEY", process.env.SHOPIFY_API_KEY],
      ["SHOPIFY_API_SECRET", process.env.SHOPIFY_API_SECRET],
      ["SHOPIFY_APP_URL", process.env.SHOPIFY_APP_URL],
    ],
  );

  logEnvCheck("Cosmos", Boolean(process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim()), [
    ["COSMOS_ENDPOINT", process.env.COSMOS_ENDPOINT],
    ["COSMOS_KEY", process.env.COSMOS_KEY],
    ["COSMOS_AGENT_RUNS_CONTAINER", process.env.COSMOS_AGENT_RUNS_CONTAINER, "agent_runs"],
  ]);

  // 主应用专用 Render KV：`SPARK_KV`
  const sparkKv = process.env.SPARK_KV?.trim();
  const redisOk = Boolean(sparkKv);
  logEnvCheck("Redis", redisOk, [["SPARK_KV", process.env.SPARK_KV]]);

  const blobConn = process.env.AZURE_BLOB_CONNECTION_STRING?.trim();
  logEnvCheck("Blob", Boolean(blobConn), [
    ["AZURE_BLOB_CONNECTION_STRING", blobConn],
  ]);

  logEnvCheck("LLM (DeepSeek)", Boolean(process.env.DEEPSEEK_API_KEY?.trim()), [
    ["DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY],
    ["DEEPSEEK_BASE_URL", process.env.DEEPSEEK_BASE_URL, "https://api.deepseek.com"],
    ["DEEPSEEK_MODEL", process.env.DEEPSEEK_MODEL, "deepseek-chat"],
  ]);

  console.info(`${ENV_LOG} process.env 总键数: ${Object.keys(process.env).length}`);
  console.info(`${ENV_LOG} =================`);
}

const RENDER_SECRET_PATHS = new Set([
  "/etc/secrets/.env",
  "/etc/secrets/env",
  "/var/secrets/.env",
]);

export function ensureRuntimeEnv(): void {
  if (runtimeEnvLoaded) return;
  runtimeEnvLoaded = true;

  if (!isVitestRuntime()) {
    console.info(
      `${ENV_LOG} NODE_ENV=${process.env.NODE_ENV}, RENDER=${process.env.RENDER}, cwd=${process.cwd()}`,
    );
  }

  const projectRoot = getProjectRoot();
  const files = candidateEnvFiles(projectRoot);
  let secretFileApplied = 0;

  for (const filePath of files) {
    const isProjectDotEnv =
      filePath === path.join(projectRoot, ".env") ||
      filePath === path.join(process.cwd(), ".env");
    const applied = tryLoadEnvFile(filePath, isProjectDotEnv);
    if (RENDER_SECRET_PATHS.has(filePath)) {
      secretFileApplied += applied;
    }
  }

  if (!isVitestRuntime()) logCriticalEnvStatus();

  if (
    process.env.RENDER &&
    secretFileApplied === 0 &&
    !process.env.SHOPIFY_API_KEY?.trim() &&
    !tursoPairOk("TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN")
  ) {
    console.warn(
      `${ENV_LOG} ⚠️ 未从 Secret File 加载任何变量，且 Turso/Shopify 均未配置。请检查 Render Environment Groups 是否包含 Secret File（文件名需为 .env）或是否已正确链接。`,
    );
  }
}

/** 运行时读取环境变量 */
export function getRuntimeEnv(name: string): string {
  return normalizeEnvValue(process.env[name]);
}

/** 排错：列出已出现的 TURSO_* 键名（不打印 token 值） */
export function describeTursoEnvKeys(): string {
  const keys = Object.keys(process.env)
    .filter((k) => k.startsWith("TURSO_"))
    .sort();
  if (keys.length === 0) {
    return (
      "process.env 中无任何 TURSO_* 键。" +
      `请确认仓库根目录 ${path.join(getProjectRoot(), ".env")} 存在且含 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN；` +
      "Render 请在 Environment 面板配置或使用 Secret File /etc/secrets/.env。"
    );
  }
  const parts = keys.map((k) => {
    const v = process.env[k] ?? "";
    if (k.includes("TOKEN") || k.includes("SECRET")) {
      return `${k}=(已设置,len=${v.length})`;
    }
    if (k.includes("URL")) {
      return `${k}=${v ? `${v.slice(0, 30)}…` : "(空)"}`;
    }
    return `${k}=${v || "(空)"}`;
  });
  return parts.join("; ");
}
