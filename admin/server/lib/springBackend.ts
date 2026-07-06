import { getEnv } from "./env.js";

export type SpringBackendEnv = "prod" | "test";

const DEFAULT_DOMAINS: Record<SpringBackendEnv, string> = {
  prod: "https://springbackendprod.azurewebsites.net",
  test: "https://springbackendservice-e3hgbjgqafb9cpdh.canadacentral-01.azurewebsites.net",
};

export function parseSpringBackendEnv(raw: unknown): SpringBackendEnv {
  const v = String(raw ?? "prod").toLowerCase();
  return v === "test" ? "test" : "prod";
}

export function getSpringBackendBaseUrl(env: SpringBackendEnv): string {
  if (env === "prod") {
    return getEnv("SPRING_BACKEND_PROD_URL", DEFAULT_DOMAINS.prod);
  }
  return getEnv("SPRING_BACKEND_TEST_URL", DEFAULT_DOMAINS.test);
}
