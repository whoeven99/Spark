const DEFAULT_REGION = "ap-hongkong";
const DEFAULT_FROM = "support@msg.ciwi.ai";
const DEFAULT_CC = ["feynman@ciwi.ai"];
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RETRIES = 3;

export type EmailConfig = {
  enabled: boolean;
  provider: string;
  tencent: {
    secretId: string;
    secretKey: string;
    region: string;
    fromEmail: string;
    cc: string[];
  } | null;
  sendTimeoutMs: number;
  maxRetries: number;
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return defaultValue;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCcList(value: string | undefined): string[] {
  if (!value?.trim()) return DEFAULT_CC;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadEmailConfig(): EmailConfig {
  const enabled = parseBoolean(process.env.EMAIL_ENABLED, true);
  const provider = (process.env.EMAIL_PROVIDER?.trim() || "tencent").toLowerCase();
  const secretId = process.env.TENCENT_CLOUD_KEY_ID?.trim() ?? "";
  const secretKey = process.env.TENCENT_CLOUD_KEY?.trim() ?? "";
  const hasTencentCredentials = secretId.length > 0 && secretKey.length > 0;

  const tencent =
    hasTencentCredentials
      ? {
          secretId,
          secretKey,
          region: process.env.TENCENT_SES_REGION?.trim() || DEFAULT_REGION,
          fromEmail: process.env.TENCENT_FROM_EMAIL?.trim() || DEFAULT_FROM,
          cc: parseCcList(process.env.TENCENT_SES_CC),
        }
      : null;

  return {
    enabled,
    provider,
    tencent,
    sendTimeoutMs: parsePositiveInt(
      process.env.EMAIL_SEND_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    maxRetries: parsePositiveInt(process.env.EMAIL_SEND_MAX_RETRIES, DEFAULT_MAX_RETRIES),
  };
}

export function isEmailSendReady(config: EmailConfig = loadEmailConfig()): boolean {
  if (!config.enabled) return false;
  if (config.provider === "tencent") return config.tencent !== null;
  return false;
}
