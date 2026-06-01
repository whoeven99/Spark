import { normalizeEnvValue } from "./runtimeEnv.server";

/** 规范化后的 `NODE_ENV`（小写、去引号）。 */
export function normalizedNodeEnv(): string {
  return normalizeEnvValue(process.env.NODE_ENV).toLowerCase();
}

/**
 * 是否为生产运行时。
 * 线上 Render 使用 `NODE_ENV=prod`；兼容 Node/框架常见的 `production`。
 */
export function isProductionNodeEnv(): boolean {
  const env = normalizedNodeEnv();
  return env === "prod" || env === "production";
}

/** 是否为显式测试运行时（`test` / `testing`）。 */
export function isTestNodeEnv(): boolean {
  const env = normalizedNodeEnv();
  return env === "test" || env === "testing";
}
