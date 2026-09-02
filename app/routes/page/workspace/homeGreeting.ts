/** 首页问候语 / 日期格式化，供真实面板与 SSR 占位共用。 */

type TranslateFn = (key: string) => string;

export function greetingForHour(hour: number, t: TranslateFn): string {
  if (hour < 6) return t("workspace.home.greeting.lateNight");
  if (hour < 12) return t("workspace.home.greeting.morning");
  if (hour < 18) return t("workspace.home.greeting.afternoon");
  return t("workspace.home.greeting.evening");
}

export function formatHomeDate(now: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
}
