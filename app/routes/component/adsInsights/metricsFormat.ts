import type { AdsInsightsMetrics } from "./types";

/** 空值 / 无数据占位，与表格空态一致 */
export const EMPTY_METRIC = "—";

export function formatCurrency(amount: number, currencyCode: string | null): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // fall through
    }
  }
  return amount.toFixed(2);
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return EMPTY_METRIC;
  return `${(ratio * 100).toFixed(2)}%`;
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return EMPTY_METRIC;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatRoas(n: number | null | undefined): string {
  if (n === null || n === undefined) return EMPTY_METRIC;
  return `${n.toFixed(2)}x`;
}

export type OptionalMetricKey =
  | "cpm"
  | "outboundClicks"
  | "videoViews"
  | "thruplay"
  | "leads"
  | "viewContent"
  | "initiateCheckout"
  | "allConversions";

export function collectOptionalMetricFlags(
  metricsList: AdsInsightsMetrics[],
): Record<OptionalMetricKey, boolean> {
  const flags: Record<OptionalMetricKey, boolean> = {
    cpm: false,
    outboundClicks: false,
    videoViews: false,
    thruplay: false,
    leads: false,
    viewContent: false,
    initiateCheckout: false,
    allConversions: false,
  };
  for (const m of metricsList) {
    if (m.cpm !== null) flags.cpm = true;
    if (m.outboundClicks !== null) flags.outboundClicks = true;
    if (m.videoViews !== null) flags.videoViews = true;
    if (m.thruplay !== null) flags.thruplay = true;
    if (m.leads !== null) flags.leads = true;
    if (m.viewContent !== null) flags.viewContent = true;
    if (m.initiateCheckout !== null) flags.initiateCheckout = true;
    if (m.allConversions !== null) flags.allConversions = true;
  }
  return flags;
}
