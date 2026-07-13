import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** 从仓库根目录 .env 加载环境变量（不覆盖已有 process.env）。 */
export async function loadDotEnv(cwd = process.cwd()) {
  const envPath = resolve(cwd, ".env");
  try {
    const content = await readFile(envPath, "utf8");
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
      if (process.env[key]) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // no .env
  }
}
