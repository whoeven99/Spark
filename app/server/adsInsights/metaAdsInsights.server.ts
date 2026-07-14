/**
 * Meta Marketing API Insights：按 Ad 级别拉取并向上聚合为 Campaign → Ad Set → Ad。
 */

import { getMetaAdsCredential } from "../adsCatalog/credentialStore.server";
import { META_GRAPH_BASE } from "../adsCatalog/metaOAuth.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { resolveDateWindow } from "./dateRange.server";
import { nestFlatAdRows } from "./nest.server";
import {
  type AdsInsightsRangeDays,
  type AdsInsightsResult,
  finalizeMetrics,
  toNumber,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights][Meta]";

type MetaAction = { action_type?: string; value?: string };
type MetaRoas = { action_type?: string; value?: string };

type MetaInsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaRoas[];
};

function sumActions(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions?.length) return 0;
  let total = 0;
  for (const a of actions) {
    const t = (a.action_type ?? "").toLowerCase();
    if (types.some((wanted) => t === wanted || t.endsWith(`.${wanted}`))) {
      total += toNumber(a.value);
    }
  }
  return total;
}

function pickRoas(rows: MetaRoas[] | undefined): number | null {
  if (!rows?.length) return null;
  const purchase = rows.find((r) => (r.action_type ?? "").toLowerCase().includes("purchase"));
  const value = toNumber((purchase ?? rows[0]).value);
  return value > 0 ? value : null;
}

async function fetchAllInsights(params: {
  accessToken: string;
  adAccountId: string;
  dateStart: string;
  dateEnd: string;
}): Promise<MetaInsightRow[]> {
  const accountId = params.adAccountId.startsWith("act_")
    ? params.adAccountId
    : `act_${params.adAccountId}`;

  const fields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "impressions",
    "clicks",
    "spend",
    "ctr",
    "cpc",
    "reach",
    "frequency",
    "actions",
    "action_values",
    "purchase_roas",
  ].join(",");

  const out: MetaInsightRow[] = [];
  const url = new URL(`${META_GRAPH_BASE}/${accountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("fields", fields);
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: params.dateStart, until: params.dateEnd }),
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", params.accessToken);

  let nextUrl: string | null = url.toString();
  let pages = 0;
  while (nextUrl && pages < 20) {
    pages += 1;
    let response: Response;
    try {
      response = await fetch(nextUrl);
    } catch (e) {
      throw new Error(`Meta Insights 网络请求失败: ${formatOutboundNetworkError(e)}`, {
        cause: e,
      });
    }
    const json = (await response.json().catch(() => ({}))) as {
      data?: MetaInsightRow[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `Meta Insights HTTP ${response.status}`);
    }
    out.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }
  return out;
}

export async function fetchMetaAdsInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
): Promise<AdsInsightsResult | null> {
  const cred = await getMetaAdsCredential(shop);
  if (!cred) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  console.info(
    `${LOG_PREFIX} step=start shop=${shop} account=${cred.adAccountId} range=${rangeDays}`,
  );

  let rows: MetaInsightRow[];
  try {
    rows = await fetchAllInsights({
      accessToken: cred.accessToken,
      adAccountId: cred.adAccountId,
      dateStart,
      dateEnd,
    });
  } catch (e) {
    console.error(`${LOG_PREFIX} step=insights shop=${shop} ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  const flat = rows
    .map((row) => {
      const impressions = toNumber(row.impressions);
      const clicks = toNumber(row.clicks);
      const spend = toNumber(row.spend);
      const purchases = sumActions(row.actions, [
        "purchase",
        "omni_purchase",
        "offsite_conversion.fb_pixel_purchase",
      ]);
      const purchaseValue = sumActions(row.action_values, [
        "purchase",
        "omni_purchase",
        "offsite_conversion.fb_pixel_purchase",
      ]);
      const addToCart = sumActions(row.actions, [
        "add_to_cart",
        "omni_add_to_cart",
        "offsite_conversion.fb_pixel_add_to_cart",
      ]);
      const landingPageViews = sumActions(row.actions, [
        "landing_page_view",
        "omni_landing_page_view",
      ]);
      // Meta 的 conversions 用购买数近似（无统一 conversions 字段）
      const conversions = purchases;
      const conversionsValue = purchaseValue;

      return {
        campaignId: String(row.campaign_id ?? "").trim(),
        campaignName: row.campaign_name?.trim() || String(row.campaign_id ?? ""),
        campaignStatus: "UNKNOWN",
        adSetId: String(row.adset_id ?? "").trim(),
        adSetName: row.adset_name?.trim() || String(row.adset_id ?? ""),
        adSetStatus: "UNKNOWN",
        adId: String(row.ad_id ?? "").trim(),
        adName: row.ad_name?.trim() || String(row.ad_id ?? ""),
        adStatus: "UNKNOWN",
        metrics: finalizeMetrics({
          impressions,
          clicks,
          spend,
          // Meta Insights CTR 为百分比字符串（如 "1.25" = 1.25%）
          ctr: toNumber(row.ctr) / 100,
          cpc: toNumber(row.cpc),
          conversions,
          conversionsValue,
          purchases,
          purchaseValue,
          addToCart,
          landingPageViews,
          reach: toNumber(row.reach) || null,
          frequency: toNumber(row.frequency) || null,
          roas: pickRoas(row.purchase_roas),
        }),
      };
    })
    .filter((r) => r.campaignId && r.adSetId && r.adId);

  const campaigns = nestFlatAdRows(flat);
  console.info(
    `${LOG_PREFIX} step=done shop=${shop} campaigns=${campaigns.length} ads=${flat.length}`,
  );

  return {
    platform: "meta",
    accountId: cred.adAccountId,
    currencyCode: cred.currencyCode ?? null,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns,
  };
}
