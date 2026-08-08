import { getGoogleAdsCredential } from "../adsCatalog/credentialStore.server";
import { resolveDateWindow } from "../adsInsights/dateRange.server";
import type { AdsInsightsRangeDays } from "../adsInsights/types.server";
import {
  getGa4Credential,
  setGa4Credential,
} from "../googleAnalytics/ga4Credentials.server";
import {
  queryGa4MergedCampaignAttribution,
  refreshGa4AccessToken,
} from "../googleAnalytics/ga4Api.server";
import { fetchGoogleAdsCampaignSummary } from "./googleAdsCampaignDaily.server";
import {
  aggregateUnifiedTotals,
  detectGa4AdsLinking,
  joinCampaignMetrics,
} from "./joinCampaignMetrics.server";
import type { UnifiedAttributionResult } from "./types.server";

const WARNINGS = {
  ga4RevenueAttribution:
    "ga4_revenue_uses_ga4_attribution_model",
  adsGa4NotLinked:
    "ads_ga4_linking_recommended",
  partialConnection:
    "connect_both_ads_and_ga4_for_full_view",
} as const;

async function resolveGa4AccessToken(shop: string): Promise<string | null> {
  const credential = await getGa4Credential(shop);
  if (!credential) return null;

  let accessToken = credential.accessToken;
  if (credential.refreshToken) {
    try {
      accessToken = await refreshGa4AccessToken(credential.refreshToken);
      await setGa4Credential(shop, { ...credential, accessToken });
    } catch {
      // refresh 失败时继续用旧 token
    }
  }
  return accessToken;
}

export async function fetchUnifiedAttribution(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
): Promise<UnifiedAttributionResult | null> {
  const [adsCredential, ga4Credential] = await Promise.all([
    getGoogleAdsCredential(shop),
    getGa4Credential(shop),
  ]);

  const adsConnected = Boolean(adsCredential);
  const ga4Connected = Boolean(ga4Credential?.properties.length);
  if (!adsConnected && !ga4Connected) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  const warnings: string[] = [WARNINGS.ga4RevenueAttribution];

  if (!adsConnected || !ga4Connected) {
    warnings.push(WARNINGS.partialConnection);
  }

  const [adsSummary, ga4AccessToken] = await Promise.all([
    adsConnected ? fetchGoogleAdsCampaignSummary(shop, rangeDays) : Promise.resolve(null),
    ga4Connected ? resolveGa4AccessToken(shop) : Promise.resolve(null),
  ]);

  let ga4Campaigns: Awaited<ReturnType<typeof queryGa4MergedCampaignAttribution>> = [];
  if (ga4Connected && ga4AccessToken && ga4Credential) {
    try {
      ga4Campaigns = await queryGa4MergedCampaignAttribution(
        ga4AccessToken,
        ga4Credential.properties.map((property) => property.propertyId),
        rangeDays,
      );
    } catch {
      warnings.push("ga4_campaign_fetch_failed");
    }
  }

  const linked = detectGa4AdsLinking(ga4Campaigns);
  if (ga4Connected && !linked) {
    warnings.push(WARNINGS.adsGa4NotLinked);
  }

  const campaigns = joinCampaignMetrics({
    adsCampaigns: adsSummary?.campaigns ?? [],
    ga4Campaigns,
    linked,
  });

  return {
    adsConnected,
    ga4Connected,
    adsAccountId: adsSummary?.accountId ?? adsCredential?.customerId ?? null,
    ga4PropertyCount: ga4Credential?.properties.length ?? 0,
    currencyCode: adsSummary?.currencyCode ?? null,
    rangeDays,
    dateStart,
    dateEnd,
    linked,
    totals: aggregateUnifiedTotals(campaigns),
    campaigns,
    warnings,
  };
}
