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
function applyEnvFileContent(
  content: string,
  sourceLabel: string,
  overrideExisting: boolean,
): number {
  let applied = 0;
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
    }
  }
  if (applied > 0) {
    console.info(`[env] 从 ${sourceLabel} 加载 ${applied} 个变量`);
  }
  return applied;
}

function tryLoadEnvFile(filePath: string, overrideExisting: boolean): void {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, "utf8");
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
export function ensureRuntimeEnv(): void {
  if (runtimeEnvLoaded) return;
  runtimeEnvLoaded = true;

  const projectRoot = getProjectRoot();
  const files = candidateEnvFiles(projectRoot);

  for (const filePath of files) {
    const isProjectDotEnv =
      filePath === path.join(projectRoot, ".env") ||
      filePath === path.join(process.cwd(), ".env");
    tryLoadEnvFile(filePath, isProjectDotEnv);
  }

  if (!isProductionNodeEnv()) {
    const hasTurso = Boolean(process.env.TURSO_TEST_DATABASE_URL?.trim());
    console.info(
      `[env] projectRoot=${projectRoot} cwd=${process.cwd()} .env=${existsSync(path.join(projectRoot, ".env")) ? "有" : "无"} TURSO_TEST_URL=${hasTurso ? "已加载" : "未加载"}`,
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
