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
  type AdsInsightsDeepRow,
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
  cpm?: string;
  reach?: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  outbound_clicks?: MetaAction[];
  video_play_actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
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

function sumActionValues(actions: MetaAction[] | undefined): number {
  if (!actions?.length) return 0;
  return actions.reduce((sum, a) => sum + toNumber(a.value), 0);
}

function pickRoas(rows: MetaRoas[] | undefined): number | null {
  if (!rows?.length) return null;
  const purchase = rows.find((r) => (r.action_type ?? "").toLowerCase().includes("purchase"));
  const value = toNumber((purchase ?? rows[0]).value);
  return value > 0 ? value : null;
}

async function graphGetAll<T>(params: {
  path: string;
  accessToken: string;
  query?: Record<string, string>;
  maxPages?: number;
}): Promise<T[]> {
  const out: T[] = [];
  const url = new URL(`${META_GRAPH_BASE}/${params.path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params.query ?? {})) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("access_token", params.accessToken);
  if (!url.searchParams.has("limit")) url.searchParams.set("limit", "500");

  let nextUrl: string | null = url.toString();
  let pages = 0;
  const maxPages = params.maxPages ?? 40;
  while (nextUrl && pages < maxPages) {
    pages += 1;
    let response: Response;
    try {
      response = await fetch(nextUrl);
    } catch (e) {
      throw new Error(`Meta Graph 网络请求失败: ${formatOutboundNetworkError(e)}`, { cause: e });
    }
    const json = (await response.json().catch(() => ({}))) as {
      data?: T[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `Meta Graph HTTP ${response.status}`);
    }
    out.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }
  return out;
}

async function fetchEntityStatuses(params: {
  accessToken: string;
  adAccountId: string;
}): Promise<{
  campaigns: Map<string, string>;
  adSets: Map<string, string>;
  ads: Map<string, string>;
}> {
  const accountId = params.adAccountId.startsWith("act_")
    ? params.adAccountId
    : `act_${params.adAccountId}`;

  const [campaigns, adSets, ads] = await Promise.all([
    graphGetAll<{ id?: string; effective_status?: string; status?: string }>({
      path: `${accountId}/campaigns`,
      accessToken: params.accessToken,
      query: { fields: "id,effective_status,status" },
    }).catch((e) => {
      console.warn(`${LOG_PREFIX} step=campaign_status ${formatOutboundErrorLog(e)}`);
      return [] as Array<{ id?: string; effective_status?: string; status?: string }>;
    }),
    graphGetAll<{ id?: string; effective_status?: string; status?: string }>({
      path: `${accountId}/adsets`,
      accessToken: params.accessToken,
      query: { fields: "id,effective_status,status" },
    }).catch((e) => {
      console.warn(`${LOG_PREFIX} step=adset_status ${formatOutboundErrorLog(e)}`);
      return [] as Array<{ id?: string; effective_status?: string; status?: string }>;
    }),
    graphGetAll<{ id?: string; effective_status?: string; status?: string }>({
      path: `${accountId}/ads`,
      accessToken: params.accessToken,
      query: { fields: "id,effective_status,status" },
    }).catch((e) => {
      console.warn(`${LOG_PREFIX} step=ad_status ${formatOutboundErrorLog(e)}`);
      return [] as Array<{ id?: string; effective_status?: string; status?: string }>;
    }),
  ]);

  const toMap = (rows: Array<{ id?: string; effective_status?: string; status?: string }>) => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      map.set(id, row.effective_status || row.status || "UNKNOWN");
    }
    return map;
  };

  return {
    campaigns: toMap(campaigns),
    adSets: toMap(adSets),
    ads: toMap(ads),
  };
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
    "cpm",
    "reach",
    "frequency",
    "actions",
    "action_values",
    "outbound_clicks",
    "video_play_actions",
    "video_thruplay_watched_actions",
    "purchase_roas",
  ].join(",");

  return graphGetAll<MetaInsightRow>({
    path: `${accountId}/insights`,
    accessToken: params.accessToken,
    query: {
      level: "ad",
      fields,
      time_range: JSON.stringify({ since: params.dateStart, until: params.dateEnd }),
      limit: "500",
    },
    maxPages: 40,
  });
}

function mapInsightRow(
  row: MetaInsightRow,
  statuses: Awaited<ReturnType<typeof fetchEntityStatuses>>,
) {
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
  const leads = sumActions(row.actions, ["lead", "onsite_conversion.lead_grouped"]);
  const viewContent = sumActions(row.actions, [
    "view_content",
    "omni_view_content",
    "offsite_conversion.fb_pixel_view_content",
  ]);
  const initiateCheckout = sumActions(row.actions, [
    "initiate_checkout",
    "omni_initiated_checkout",
    "offsite_conversion.fb_pixel_initiate_checkout",
  ]);
  const campaignId = String(row.campaign_id ?? "").trim();
  const adSetId = String(row.adset_id ?? "").trim();
  const adId = String(row.ad_id ?? "").trim();

  return {
    campaignId,
    campaignName: row.campaign_name?.trim() || campaignId,
    campaignStatus: statuses.campaigns.get(campaignId) ?? "UNKNOWN",
    adSetId,
    adSetName: row.adset_name?.trim() || adSetId,
    adSetStatus: statuses.adSets.get(adSetId) ?? "UNKNOWN",
    adId,
    adName: row.ad_name?.trim() || adId,
    adStatus: statuses.ads.get(adId) ?? "UNKNOWN",
    metrics: finalizeMetrics({
      impressions,
      clicks,
      spend,
      ctr: toNumber(row.ctr) / 100,
      cpc: toNumber(row.cpc),
      cpm: toNumber(row.cpm) || null,
      conversions: purchases,
      conversionsValue: purchaseValue,
      purchases,
      purchaseValue,
      addToCart,
      landingPageViews,
      reach: toNumber(row.reach) || null,
      frequency: toNumber(row.frequency) || null,
      outboundClicks: sumActionValues(row.outbound_clicks) || null,
      videoViews: sumActionValues(row.video_play_actions) || null,
      thruplay: sumActionValues(row.video_thruplay_watched_actions) || null,
      leads: leads || null,
      viewContent: viewContent || null,
      initiateCheckout: initiateCheckout || null,
      roas: pickRoas(row.purchase_roas),
    }),
  };
}

export async function fetchMetaAdsInsightsWithCredential(params: {
  shop?: string;
  accessToken: string;
  adAccountId: string;
  currencyCode?: string | null;
  accountName?: string | null;
  rangeDays: AdsInsightsRangeDays;
  options?: { includeCreatives?: boolean };
  sandbox?: boolean;
}): Promise<AdsInsightsResult> {
  const shop = params.shop ?? "sandbox";
  const { dateStart, dateEnd } = resolveDateWindow(params.rangeDays);
  console.info(
    `${LOG_PREFIX} step=start shop=${shop} account=${params.adAccountId} range=${params.rangeDays} sandbox=${Boolean(params.sandbox)}`,
  );

  let rows: MetaInsightRow[];
  let statuses: Awaited<ReturnType<typeof fetchEntityStatuses>>;
  try {
    [rows, statuses] = await Promise.all([
      fetchAllInsights({
        accessToken: params.accessToken,
        adAccountId: params.adAccountId,
        dateStart,
        dateEnd,
      }),
      fetchEntityStatuses({
        accessToken: params.accessToken,
        adAccountId: params.adAccountId,
      }),
    ]);
  } catch (e) {
    console.error(`${LOG_PREFIX} step=insights shop=${shop} ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  const flat = rows
    .map((row) => mapInsightRow(row, statuses))
    .filter((r) => r.campaignId && r.adSetId && r.adId);

  const wantCreatives = Boolean(params.options?.includeCreatives);
  const campaigns = wantCreatives ? [] : nestFlatAdRows(flat);
  const creatives = wantCreatives
    ? flat.map(
        (row) =>
          ({
            id: row.adId,
            name: row.adName,
            status: row.adStatus,
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            adSetId: row.adSetId,
            adSetName: row.adSetName,
            adId: row.adId,
            adName: row.adName,
            detail: null,
            metrics: row.metrics,
          }) satisfies AdsInsightsDeepRow,
      )
    : [];

  console.info(
    `${LOG_PREFIX} step=done shop=${shop} campaigns=${campaigns.length} ads=${flat.length}`,
  );

  return {
    platform: "meta",
    accountId: params.adAccountId,
    accountName: params.accountName ?? null,
    sandbox: Boolean(params.sandbox),
    currencyCode: params.currencyCode ?? null,
    rangeDays: params.rangeDays,
    dateStart,
    dateEnd,
    campaigns,
    keywords: [],
    searchTerms: [],
    creatives,
  };
}

export async function fetchMetaAdsInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
  options?: { includeCreatives?: boolean },
): Promise<AdsInsightsResult | null> {
  const cred = await getMetaAdsCredential(shop);
  if (!cred) return null;

  return fetchMetaAdsInsightsWithCredential({
    shop,
    accessToken: cred.accessToken,
    adAccountId: cred.adAccountId,
    currencyCode: cred.currencyCode,
    accountName: cred.adAccountName,
    rangeDays,
    options,
    sandbox: false,
  });
}
