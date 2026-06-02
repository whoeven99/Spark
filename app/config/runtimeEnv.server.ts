import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isProductionNodeEnv } from "./nodeEnv.server";

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
  sourceLabel: string,
  overrideExisting: boolean,
): number {
  let applied = 0;
  const loadedKeys: string[] = [];
  const skippedKeys: string[] = [];
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
      applied += 1;
      loadedKeys.push(`${key}=${maskValue(key, value)}`);
    } else if (alreadySet) {
      skippedKeys.push(`${key}(已有值,跳过)`);
    }
  }
  if (applied > 0) {
    console.info(`[env] 从 ${sourceLabel} 加载 ${applied} 个变量: ${loadedKeys.join("; ")}`);
  }
  if (skippedKeys.length > 0) {
    console.info(`[env] 从 ${sourceLabel} 跳过 ${skippedKeys.length} 个已有键: ${skippedKeys.join("; ")}`);
  }
  return applied;
}

function tryLoadEnvFile(filePath: string, overrideExisting: boolean): void {
  const exists = existsSync(filePath);
  console.info(`[env] 检查 ${filePath}: ${exists ? "存在" : "不存在"}`);
  if (!exists) return;
  try {
    const content = readFileSync(filePath, "utf8");
    const lineCount = content.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    console.info(`[env] ${filePath} 共 ${lineCount} 行有效内容`);
    applyEnvFileContent(content, filePath, overrideExisting);
  } catch (error) {
    console.warn(`[env] 读取 ${filePath} 失败:`, error);
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

  // 去重，保持顺序：仓库 .env 优先
  const ordered = [rootEnv, ...fromEnv, cwdEnv, ...secretPaths];
  return [...new Set(ordered)];
}

/**
 * 启动时加载 .env（本地）与 Render Secret File。
 * 会合并多个文件，不再「读到第一个就 break」。
 */
/** 列出指定前缀的环境变量键，用于排错 */
function logEnvKeysByPrefix(prefix: string): string[] {
  return Object.keys(process.env)
    .filter((k) => k.startsWith(prefix))
    .sort();
}

/** 排错：打印关键环境变量是否存在（不含值内容，不含敏感信息） */
function logCriticalEnvStatus(): void {
  const prefixes = ["COSMOS_", "REDIS_", "BLOB_", "AZURE_", "TURSO_", "DEEPSEEK_", "OPENAI_", "SHOPIFY_", "TENCENT_", "LANGSMITH_", "FEISHU_"];
  const found: string[] = [];
  const missing: string[] = [];

  for (const prefix of prefixes) {
    const keys = logEnvKeysByPrefix(prefix);
    if (keys.length > 0) {
      found.push(`${prefix}(${keys.length}个): ${keys.join(", ")}`);
    } else {
      missing.push(prefix);
    }
  }

  console.info(`[env] ===== 环境变量诊断 =====`);
  console.info(`[env] NODE_ENV=${process.env.NODE_ENV}, RENDER=${process.env.RENDER}, projectRoot=${getProjectRoot()}, cwd=${process.cwd()}`);
  console.info(`[env] COSMOS_ENDPOINT=${process.env.COSMOS_ENDPOINT ? "已设置" : "❌ 缺失"}`);
  console.info(`[env] COSMOS_KEY=${process.env.COSMOS_KEY ? "已设置" : "❌ 缺失"}`);
  if (found.length > 0) {
    console.info(`[env] 已加载的变量前缀: ${found.join(" | ")}`);
  }
  if (missing.length > 0) {
    console.warn(`[env] 未找到的前缀: ${missing.join(", ")}`);
  }
  console.info(`[env] process.env 总键数: ${Object.keys(process.env).length}`);
  console.info(`[env] ===== 诊断结束 =====`);
}

export function ensureRuntimeEnv(): void {
  if (runtimeEnvLoaded) return;
  runtimeEnvLoaded = true;

  const projectRoot = getProjectRoot();
  const files = candidateEnvFiles(projectRoot);

  console.info(`[env] 准备扫描 ${files.length} 个候选 .env 路径`);

  for (const filePath of files) {
    const isProjectDotEnv =
      filePath === path.join(projectRoot, ".env") ||
      filePath === path.join(process.cwd(), ".env");
    tryLoadEnvFile(filePath, isProjectDotEnv);
  }

  // 总是打印关键环境变量状态（不再受 isProductionNodeEnv 限制）
  logCriticalEnvStatus();
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
      `请确认仓库根目录 ${path.join(getProjectRoot(), ".env")} 存在且含 TURSO_TEST_*；` +
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
