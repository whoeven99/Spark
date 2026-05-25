import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env"),          // admin/.env (local override)
    path.join(cwd, "../.env"),       // repo root .env (run from admin/)
    path.join(cwd, "../../.env"),    // two levels up
    "/etc/secrets/.env",             // Render secret file
    "/etc/secrets/env",
  ];
  for (const p of candidates) applyEnvFile(p);
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}
