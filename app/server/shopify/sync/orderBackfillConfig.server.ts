/**
 * 订单历史回补窗口配置。
 *
 * 环境变量：`SPARK_ORDER_BACKFILL_DAYS`（整数天，默认 30，夹在 1–365）。
 * 安装自动回补与设置 › 数据手动回补共用此默认值；手动表单仍可临时改天数。
 */

const ENV_KEY = "SPARK_ORDER_BACKFILL_DAYS";
const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

export const ORDER_BACKFILL_DAYS_ENV = ENV_KEY;
export const ORDER_BACKFILL_DAYS_DEFAULT = DEFAULT_DAYS;

/** 解析并夹紧回补天数；非法或空值回退默认 30。 */
export function resolveOrderBackfillDays(raw: string | undefined | null): number {
  if (raw == null || !String(raw).trim()) return DEFAULT_DAYS;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, parsed));
}

/** 当前进程的默认回补窗口（读环境变量）。 */
export function getOrderBackfillDays(): number {
  return resolveOrderBackfillDays(process.env[ENV_KEY]);
}
