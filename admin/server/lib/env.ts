import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function applyEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function loadEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const adminRoot = path.resolve(here, "../..");
  const repoRoot = path.resolve(here, "../../..");
  const cwd = process.cwd();
  // 先写先胜，且不覆盖进程里已有的值（Render secrets 优先）。
  // 本地 DeepSeek / 火山在 .env.test，主应用会叠读，Admin 以前只读 .env。
  const candidates = [
    path.join(cwd, ".env"),
    path.join(adminRoot, ".env"),
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.admin.test"),
    path.join(repoRoot, ".env.test"),
    "/etc/secrets/.env",
    "/etc/secrets/env",
  ];
  for (const filePath of candidates) applyEnvFile(filePath);
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}
