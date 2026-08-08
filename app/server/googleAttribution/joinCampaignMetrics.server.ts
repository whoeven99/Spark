import {
  isGa4CampaignNamePresent,
  normalizeCampaignName,
} from "./normalizeCampaignName.server";
import type {
  AttributionMatchQuality,
  UnifiedAttributionTotals,
  UnifiedCampaignRow,
} from "./types.server";

export type AdsCampaignMetrics = {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
};

export type Ga4CampaignMetrics = {
  campaignName: string;
  users: number;
  sessions: number;
  revenue: number;
  purchases: number;
};

function roas(revenue: number, spend: number): number | null {
  if (spend <= 0) return null;
  return revenue / spend;
}

export function aggregateUnifiedTotals(rows: UnifiedCampaignRow[]): UnifiedAttributionTotals {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const ga4Revenue = rows.reduce((sum, row) => sum + row.ga4Revenue, 0);
  return {
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    spend,
    adsConversions: rows.reduce((sum, row) => sum + row.adsConversions, 0),
    adsConversionValue: rows.reduce((sum, row) => sum + row.adsConversionValue, 0),
    sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
    users: rows.reduce((sum, row) => sum + row.users, 0),
    ga4Revenue,
    ga4Purchases: rows.reduce((sum, row) => sum + row.ga4Purchases, 0),
    roas: roas(ga4Revenue, spend),
  };
}

export function detectGa4AdsLinking(rows: Ga4CampaignMetrics[]): boolean {
  return rows.some((row) => isGa4CampaignNamePresent(row.campaignName));
}

export function joinCampaignMetrics(params: {
  adsCampaigns: AdsCampaignMetrics[];
  ga4Campaigns: Ga4CampaignMetrics[];
  linked: boolean;
}): UnifiedCampaignRow[] {
  const ga4ByKey = new Map<string, Ga4CampaignMetrics>();
  for (const row of params.ga4Campaigns) {
    if (!isGa4CampaignNamePresent(row.campaignName)) continue;
    const key = normalizeCampaignName(row.campaignName);
    const existing = ga4ByKey.get(key);
    if (existing) {
      ga4ByKey.set(key, {
        campaignName: existing.campaignName,
        users: existing.users + row.users,
        sessions: existing.sessions + row.sessions,
        revenue: existing.revenue + row.revenue,
        purchases: existing.purchases + row.purchases,
      });
    } else {
      ga4ByKey.set(key, { ...row });
    }
  }

  const rows: UnifiedCampaignRow[] = [];
  const consumedGa4Keys = new Set<string>();

  for (const ads of params.adsCampaigns) {
    const key = normalizeCampaignName(ads.campaignName);
    const ga4 = ga4ByKey.get(key);
    if (ga4) consumedGa4Keys.add(key);

    const matchQuality: AttributionMatchQuality = ga4
      ? params.linked
        ? "linked"
        : "name_only"
      : "ads_only";

    rows.push({
      campaignId: ads.campaignId,
      campaignName: ads.campaignName,
      impressions: ads.impressions,
      clicks: ads.clicks,
      spend: ads.spend,
      adsConversions: ads.conversions,
      adsConversionValue: ads.conversionValue,
      sessions: ga4?.sessions ?? 0,
      users: ga4?.users ?? 0,
      ga4Revenue: ga4?.revenue ?? 0,
      ga4Purchases: ga4?.purchases ?? 0,
      roas: roas(ga4?.revenue ?? 0, ads.spend),
      matchQuality,
    });
  }

  for (const [key, ga4] of ga4ByKey) {
    if (consumedGa4Keys.has(key)) continue;
    rows.push({
      campaignId: null,
      campaignName: ga4.campaignName,
      impressions: 0,
      clicks: 0,
      spend: 0,
      adsConversions: 0,
      adsConversionValue: 0,
      sessions: ga4.sessions,
      users: ga4.users,
      ga4Revenue: ga4.revenue,
      ga4Purchases: ga4.purchases,
      roas: null,
      matchQuality: "ga4_only",
    });
  }

  return rows.sort((a, b) => b.spend - a.spend || b.ga4Revenue - a.ga4Revenue);
}
