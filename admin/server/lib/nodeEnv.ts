function normalizeEnvValue(value: string | undefined): string {
  if (value == null) return "";
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v.toLowerCase();
}

export function isProductionNodeEnv(): boolean {
  const env = normalizeEnvValue(process.env.NODE_ENV);
  return env === "prod" || env === "production";
}

export function isTestNodeEnv(): boolean {
  const env = normalizeEnvValue(process.env.NODE_ENV);
  return env === "test" || env === "testing";
}
