/** 与 TSF app/server/translateV4/autoScanSchedule.server.ts 保持口径一致。 */

export const AUTO_TRANSLATE_INTERVAL_MS_DEFAULT = 60 * 60_000;
export const AUTO_TRANSLATE_SCHEDULE_TZ_DEFAULT = "Asia/Shanghai";
export const AUTO_TRANSLATE_SCHEDULE_MINUTE_DEFAULT = 0;

export function getAutoTranslateIntervalMs(): number {
  const n = Number(process.env.AUTO_TRANSLATE_INTERVAL_MS);
  return n > 0 ? n : AUTO_TRANSLATE_INTERVAL_MS_DEFAULT;
}

export function getAutoTranslateScheduleTimezone(): string {
  return (
    process.env.AUTO_TRANSLATE_SCHEDULE_TZ?.trim() ||
    AUTO_TRANSLATE_SCHEDULE_TZ_DEFAULT
  );
}

export function getAutoTranslateScheduleMinute(): number {
  const n = Number(process.env.AUTO_TRANSLATE_SCHEDULE_MINUTE);
  if (!Number.isFinite(n) || n < 0 || n > 59) {
    return AUTO_TRANSLATE_SCHEDULE_MINUTE_DEFAULT;
  }
  return Math.floor(n);
}

function timezoneOffsetMs(at: Date, timeZone: string): number {
  const utc = Date.parse(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const tz = Date.parse(at.toLocaleString("en-US", { timeZone }));
  return tz - utc;
}

function tzYmdHm(
  at: Date,
  timeZone: string,
): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    y: pick("year"),
    m: pick("month"),
    d: pick("day"),
    h: pick("hour"),
    min: pick("minute"),
  };
}

function utcFromTzLocal(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(y, m - 1, d, h, min, 0, 0);
  for (let i = 0; i < 4; i++) {
    const p = tzYmdHm(new Date(guess), timeZone);
    if (p.y === y && p.m === m && p.d === d && p.h === h && p.min === min) {
      return new Date(guess);
    }
    const offset = timezoneOffsetMs(new Date(guess), timeZone);
    guess = Date.UTC(y, m - 1, d, h, min, 0, 0) - offset;
  }
  return new Date(guess);
}

export function resolveNextClockAlignedScanAt(
  now = new Date(),
  intervalMs = getAutoTranslateIntervalMs(),
  timeZone = getAutoTranslateScheduleTimezone(),
  scheduleMinute = getAutoTranslateScheduleMinute(),
): Date {
  const interval = Math.max(60_000, intervalMs);
  const cur = tzYmdHm(now, timeZone);
  let slot = utcFromTzLocal(
    cur.y,
    cur.m,
    cur.d,
    cur.h,
    scheduleMinute,
    timeZone,
  );

  while (slot.getTime() <= now.getTime() + 1000) {
    const p = tzYmdHm(new Date(slot.getTime() + interval), timeZone);
    slot = utcFromTzLocal(p.y, p.m, p.d, p.h, scheduleMinute, timeZone);
  }

  return slot;
}

export function msUntilNextClockAlignedScan(
  now = new Date(),
  intervalMs = getAutoTranslateIntervalMs(),
  timeZone = getAutoTranslateScheduleTimezone(),
  scheduleMinute = getAutoTranslateScheduleMinute(),
): number {
  const next = resolveNextClockAlignedScanAt(
    now,
    intervalMs,
    timeZone,
    scheduleMinute,
  );
  return Math.max(1000, next.getTime() - now.getTime());
}
