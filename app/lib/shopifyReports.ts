export const REPORT_TABS = [
  "sales",
  "refunds",
  "customers",
  "inventory",
  "fulfillment",
  "storefront",
] as const;

export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_RANGES = ["7d", "30d", "90d", "365d"] as const;

export type RangeKey = (typeof REPORT_RANGES)[number];

export const DEFAULT_REPORT_TAB: ReportTab = "sales";
export const DEFAULT_REPORT_RANGE: RangeKey = "30d";

export const RANGE_SINCE: Record<RangeKey, string> = {
  "7d": "-7d",
  "30d": "-30d",
  "90d": "-90d",
  "365d": "-365d",
};

export type ReportPresetKind = "summary" | "timeseries" | "table";

export type ShopifyqlColumn = {
  name: string;
  dataType: string;
  displayName: string;
};

export type ReportCellValue = string | number | boolean | null;

export type ReportQueryResult = {
  id: string;
  kind: ReportPresetKind;
  query: string;
  titleKey: string;
  seriesKeys: string[];
  xKey: string;
  columns: ShopifyqlColumn[];
  rows: Array<Record<string, ReportCellValue>>;
  parseErrors: string[];
  error: string | null;
};

export type ShopifyReportsAccess = "ok" | "missing_scope" | "access_denied";

export type ShopifyReportsPageData = {
  tab: ReportTab;
  range: RangeKey;
  access: ShopifyReportsAccess;
  currencyCode: string | null;
  ianaTimezone: string | null;
  queries: ReportQueryResult[];
};

export function isReportTab(value: string): value is ReportTab {
  return (REPORT_TABS as readonly string[]).includes(value);
}

export function isRangeKey(value: string): value is RangeKey {
  return (REPORT_RANGES as readonly string[]).includes(value);
}

export function parseReportTab(value: string | null): ReportTab {
  return value && isReportTab(value) ? value : DEFAULT_REPORT_TAB;
}

export function parseRangeKey(value: string | null): RangeKey {
  return value && isRangeKey(value) ? value : DEFAULT_REPORT_RANGE;
}

export function hasReadReportsScope(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope
    .split(",")
    .map((item) => item.trim())
    .includes("read_reports");
}

export function interpolateSince(query: string, range: RangeKey): string {
  return query.replaceAll("{{SINCE}}", RANGE_SINCE[range]);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toReportCellValue(value: unknown): ReportCellValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

export function normalizeReportRows(rows: unknown): Array<Record<string, ReportCellValue>> {
  if (!Array.isArray(rows)) return [];
  const result: Array<Record<string, ReportCellValue>> = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const mapped: Record<string, ReportCellValue> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[key] = toReportCellValue(value);
    }
    result.push(mapped);
  }
  return result;
}

function parseNumeric(value: ReportCellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatReportCell(
  value: ReportCellValue,
  dataType: string,
  options: { locale: string; currencyCode?: string | null },
): string {
  if (value == null || value === "") return "—";
  const type = dataType.toUpperCase();
  const numeric = parseNumeric(value);

  if (type.includes("PERCENT") && numeric != null) {
    return `${(numeric * 100).toLocaleString(options.locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })}%`;
  }

  if (type.includes("MONEY") && numeric != null) {
    try {
      return new Intl.NumberFormat(options.locale, {
        style: "currency",
        currency: options.currencyCode || "USD",
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch {
      return numeric.toLocaleString(options.locale, { maximumFractionDigits: 2 });
    }
  }

  if ((type.includes("INTEGER") || type.includes("FLOAT") || type.includes("DECIMAL")) && numeric != null) {
    return numeric.toLocaleString(options.locale, { maximumFractionDigits: type.includes("INTEGER") ? 0 : 2 });
  }

  if (type.includes("DURATION") && numeric != null) {
    const unit = type.includes("HOUR") ? "h" : type.includes("SECOND") ? "s" : "d";
    return `${numeric.toLocaleString(options.locale, { maximumFractionDigits: 1 })}${unit}`;
  }

  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function readNumericCell(
  row: Record<string, ReportCellValue> | undefined,
  key: string,
): number | null {
  if (!row) return null;
  return parseNumeric(row[key] ?? null);
}

export function niceChartMagnitude(raw: number): number {
  const abs = Math.abs(raw);
  if (abs <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(abs));
  const normed = abs / mag;
  const nice = normed <= 1 ? 1 : normed <= 2 ? 2 : normed <= 5 ? 5 : 10;
  return nice * mag;
}

export function computeLinearChartDomain(values: number[]): { min: number; max: number } {
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const min = rawMin < 0 ? -niceChartMagnitude(rawMin) : 0;
  const max = rawMax > 0 ? niceChartMagnitude(rawMax) : 0;
  if (min === 0 && max === 0) return { min: 0, max: 1 };
  return { min, max };
}

export function chartAxisTicks(min: number, max: number): number[] {
  if (min < 0 && max > 0) return [min, 0, max];
  if (min < 0) return [min, min / 2, 0];
  return [0, max / 2, max];
}
