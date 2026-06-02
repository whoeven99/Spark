import { existsSync, readFileSync } from "node:fs";

/** 去掉首尾空白与成对引号 */
function normalize(value: string): string {
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function maskValue(key: string, value: string): string {
  if (!value) return "(空)";
  if (/token|secret|key|password|auth/i.test(key)) {
    return `(已设置,len=${value.length})`;
  }
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

/** 加载单个 KEY=VALUE 文件，仅设置尚为空的键（不覆盖 Render 已注入的） */
function loadEnvFile(filePath: string): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      const value = normalize(line.slice(eq + 1));
      if (process.env[key] !== undefined && process.env[key] !== "") {
        skipped.push(key);
        continue;
      }
      process.env[key] = value;
      applied.push(`${key}=${maskValue(key, value)}`);
    }
  } catch (err) {
    console.error(`[worker:env] 读取 ${filePath} 失败:`, err);
  }
  return { applied, skipped };
}

const SECRET_PATHS = [
  "/etc/secrets/.env",
  "/etc/secrets/env",
  "/var/secrets/.env",
];

/** 启动时加载 Render Secret File + 打印诊断 */
export function ensureWorkerEnv(): void {
  console.info(`[worker:env] NODE_ENV=${process.env.NODE_ENV}, RENDER=${process.env.RENDER}, cwd=${process.cwd()}`);

  let anyLoaded = false;
  for (const p of SECRET_PATHS) {
    const exists = existsSync(p);
    console.info(`[worker:env] 检查 ${p}: ${exists ? "存在" : "不存在"}`);
    if (exists) {
      const { applied, skipped } = loadEnvFile(p);
      if (applied.length > 0) {
        console.info(`[worker:env] 从 ${p} 加载 ${applied.length} 个变量: ${applied.join("; ")}`);
        anyLoaded = true;
      }
      if (skipped.length > 0) {
        console.info(`[worker:env] 跳过 ${skipped.length} 个已有键: ${skipped.join(", ")}`);
      }
    }
  }

  // 关键变量诊断
  console.info("[worker:env] ===== 关键变量 =====");
  const critical = ["COSMOS_ENDPOINT", "COSMOS_KEY", "COSMOS_TRANSLATION_DATABASE_ID", "COSMOS_TRANSLATION_V4_JOBS_CONTAINER", "REDIS_HOSTNAME", "REDIS_PASSWORD", "REDIS_PORT", "AZURE_BLOB_CONNECTION_STRING", "AZURE_BLOB_TRANSLATION_CONTAINER", "BLOB_TRANSLATE_V3_STORAGE_ACCOUNT_NAME", "BLOB_TRANSLATE_V3_STORAGE_ACCOUNT_KEY", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"];
  for (const k of critical) {
    const v = process.env[k];
    console.info(`[worker:env]   ${k}=${v ? maskValue(k, v) : "❌ 缺失"}`);
  }
  console.info(`[worker:env] process.env 总键数: ${Object.keys(process.env).length}`);
  console.info("[worker:env] =================");

  if (!anyLoaded && !process.env.COSMOS_ENDPOINT) {
    console.warn("[worker:env] ⚠️ 未从 Secret File 加载任何变量，且 COSMOS_ENDPOINT 未设置。请检查 Render Environment Groups 是否包含 Secret File（文件名需为 .env）或是否已正确链接。");
  }
}
