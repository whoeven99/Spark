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
