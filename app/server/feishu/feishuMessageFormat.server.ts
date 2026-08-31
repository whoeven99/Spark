import { normalizeEnvValue } from "../../config/runtimeEnv.server";

/** 运营通知时间：上海时区，YYYY-MM-DD HH:mm */
export function formatOpsNotifyTime(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** 运营通知价格：全角括号突出金额 */
export function formatOpsNotifyPrice(
  priceAmount: string,
  currencyCode: string,
): string {
  return `【${priceAmount} ${currencyCode}】`;
}

function hostFromUrl(raw: string | undefined): string {
  const value = normalizeEnvValue(raw);
  if (!value) return "";
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

export type OpsEnvLabel = "生产" | "测试" | "本地";

/**
 * 飞书运营通知环境标签。
 * 测/产常共用同一 webhook，且测环境也可能 NODE_ENV=prod，故优先看 URL / 显式变量。
 */
export function resolveOpsEnvLabel(
  env: NodeJS.ProcessEnv = process.env,
): OpsEnvLabel {
  const explicit = normalizeEnvValue(
    env.SPARK_OPS_ENV ?? env.FEISHU_ENV_LABEL,
  ).toLowerCase();
  if (explicit === "prod" || explicit === "production" || explicit === "生产") {
    return "生产";
  }
  if (explicit === "本地" || explicit === "dev" || explicit === "development") {
    return "本地";
  }
  if (
    explicit === "test" ||
    explicit === "testing" ||
    explicit === "测试"
  ) {
    return "测试";
  }

  const appHost = hostFromUrl(env.SHOPIFY_APP_URL ?? env.RENDER_EXTERNAL_URL);
  if (appHost.includes("spark-prod.onrender.com")) return "生产";
  if (appHost.includes("aiassistant-wi7b.onrender.com")) return "测试";
  if (appHost.includes("onrender.com") && appHost.includes("test")) {
    return "测试";
  }

  const tursoHost = hostFromUrl(env.TURSO_DATABASE_URL);
  if (tursoHost.includes("spark-prod")) return "生产";
  if (tursoHost.includes("spark-test")) return "测试";

  const nodeEnv = normalizeEnvValue(env.NODE_ENV).toLowerCase();
  if (nodeEnv === "prod" || nodeEnv === "production") return "生产";
  if (nodeEnv === "test" || nodeEnv === "testing") return "测试";
  return "本地";
}

/**
 * 标题加环境前缀，例如 `【测试】🎁 安装福利 Token 已自动发放`。
 * 用全角【】，避免飞书把 `[测试]` 当成 Markdown 链接语法吞掉。
 */
export function formatOpsNotifyTitle(
  baseTitle: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `【${resolveOpsEnvLabel(env)}】${baseTitle}`;
}
