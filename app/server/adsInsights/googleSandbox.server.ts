/**
 * Google Ads 测试账号（Insights 沙盒）：OAuth 凭证与 Catalog/生产 Insights 隔离。
 * 结构走真实 Google Ads API；测试账号无投放指标时由本地 mock 注入。
 */

import {
  getGoogleAdsSandboxCredential,
  setGoogleAdsSandboxCredential,
} from "../adsCatalog/credentialStore.server";
import {
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
} from "../adsCatalog/googleOAuth.server";
import {
  buildGoogleAdsHeaders,
  formatGoogleAdsUserError,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
  resolveLoginCustomerId,
} from "../adsCatalog/googleAdsApi.server";
import { refreshGoogleAccessToken } from "../adsCatalog/clients/googleMerchantClient.server";
import {
  formatOutboundErrorLog,
  formatOutboundNetworkError,
} from "../common/outboundError.server";
import { resolveDateWindow } from "./dateRange.server";
import { nestFlatAdRows } from "./nest.server";
import {
  applyGoogleSandboxMockDeepRows,
  applyGoogleSandboxMockMetrics,
} from "./googleSandboxMock.server";
import {
  type AdsInsightsDeepRow,
  type AdsInsightsRangeDays,
  type AdsInsightsResult,
  finalizeMetrics,
} from "./types.server";

const LOG_PREFIX = "[AdsInsights][Google][Sandbox]";

type QueryParams = {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
};

interface GaqlRow {
  campaign?: { id?: string; name?: string; status?: string };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: {
    status?: string;
    ad?: { id?: string; name?: string; type?: string };
  };
  adGroupCriterion?: {
    criterion_id?: string;
    keyword?: { text?: string; match_type?: string };
    status?: string;
  };
  customer?: { currency_code?: string };
}

interface SearchStreamResponse {
  results?: GaqlRow[];
}

export type GoogleSandboxSeedResult = {
  customerId: string;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
  keywordId: string | null;
  campaignName: string;
  warnings: string[];
};

async function maybeRefreshSandboxToken(shop: string): Promise<string | null> {
  const cred = await getGoogleAdsSandboxCredential(shop);
  if (!cred?.refreshToken) return cred?.accessToken ?? null;

  const { clientId, clientSecret } = getGoogleOAuthClient();
  if (!clientId || !clientSecret) return cred.accessToken;

  const refreshed = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (!refreshed) return cred.accessToken;

  await setGoogleAdsSandboxCredential(shop, {
    accessToken: refreshed.accessToken,
    refreshToken: cred.refreshToken,
    customerId: cred.customerId,
    loginCustomerId: cred.loginCustomerId,
    descriptiveName: cred.descriptiveName,
  });
  return refreshed.accessToken;
}

async function executeGaqlQuery(params: QueryParams & { query: string }): Promise<GaqlRow[]> {
  const cleanId = normalizeCustomerId(params.customerId);
  const url = googleAdsApiUrl(`/customers/${cleanId}/googleAds:searchStream`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: params.accessToken,
          developerToken: params.developerToken,
          loginCustomerId: params.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: params.query }),
    });
  } catch (e) {
    throw new Error(`Google Ads API 网络请求失败: ${formatOutboundNetworkError(e)}`, {
      cause: e,
    });
  }

  const text = await response.text();
  if (!response.ok) {
    const detail = parseGoogleAdsError(text, response.status);
    throw new Error(formatGoogleAdsUserError(detail));
  }

  let batches: SearchStreamResponse[] = [];
  try {
    const parsed = JSON.parse(text) as SearchStreamResponse | SearchStreamResponse[];
    batches = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error("Google Ads API 返回了无效的 JSON 数据");
  }
  return batches.flatMap((b) => b.results ?? []);
}

async function executeMutate(
  params: QueryParams & { operations: Record<string, unknown>[] },
): Promise<Record<string, unknown>> {
  const cleanId = normalizeCustomerId(params.customerId);
  const url = googleAdsApiUrl(`/customers/${cleanId}/googleAds:mutate`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: params.accessToken,
          developerToken: params.developerToken,
          loginCustomerId: params.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mutateOperations: params.operations }),
    });
  } catch (e) {
    throw new Error(`Google Ads Mutate 网络请求失败: ${formatOutboundNetworkError(e)}`, {
      cause: e,
    });
  }

  const text = await response.text();
  if (!response.ok) {
    const detail = parseGoogleAdsError(text, response.status);
    throw new Error(formatGoogleAdsUserError(detail));
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Google Ads Mutate 返回了无效的 JSON 数据");
  }
}

function extractResourceId(
  mutateResponse: Record<string, unknown>,
  operationIndex: number,
): string | null {
  const results = mutateResponse.mutateOperationResponses;
  if (!Array.isArray(results) || !results[operationIndex]) return null;
  const item = results[operationIndex] as Record<string, unknown>;
  const keys = [
    "campaignBudgetResult",
    "campaignResult",
    "adGroupResult",
    "adGroupAdResult",
    "adGroupCriterionResult",
  ];
  for (const key of keys) {
    const result = item[key] as { resourceName?: string } | undefined;
    const resourceName = result?.resourceName?.trim();
    if (!resourceName) continue;
    const id = resourceName.split("/").pop();
    if (id) return id;
  }
  return null;
}

async function resolveSandboxQueryParams(shop: string): Promise<QueryParams | null> {
  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) return null;

  const cred = await getGoogleAdsSandboxCredential(shop);
  if (!cred) return null;

  const accessToken = (await maybeRefreshSandboxToken(shop)) ?? cred.accessToken;
  const loginCustomerId = await resolveLoginCustomerId({
    accessToken,
    developerToken,
    customerId: cred.customerId,
    accessibleCustomerIds: cred.loginCustomerId
      ? [cred.loginCustomerId, cred.customerId]
      : [cred.customerId],
  });

  if (loginCustomerId !== (cred.loginCustomerId?.trim() || "")) {
    await setGoogleAdsSandboxCredential(shop, {
      accessToken,
      refreshToken: cred.refreshToken,
      customerId: cred.customerId,
      loginCustomerId,
      descriptiveName: cred.descriptiveName,
    });
  }

  return {
    accessToken,
    developerToken,
    customerId: cred.customerId,
    loginCustomerId,
  };
}

async function fetchStructureRows(params: QueryParams): Promise<{
  rows: GaqlRow[];
  currencyCode: string | null;
}> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      customer.currency_code
    FROM ad_group_ad
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY campaign.id, ad_group.id
  `;
  const rows = await executeGaqlQuery({ ...params, query });
  let currencyCode: string | null = null;
  for (const row of rows) {
    if (row.customer?.currency_code) {
      currencyCode = row.customer.currency_code;
      break;
    }
  }
  return { rows, currencyCode };
}

async function fetchKeywordRows(params: QueryParams): Promise<AdsInsightsDeepRow[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status
    FROM keyword_view
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY campaign.id, ad_group.id
  `;
  const rows = await executeGaqlQuery({ ...params, query });
  const out: AdsInsightsDeepRow[] = [];
  for (const row of rows) {
    const id = String(row.adGroupCriterion?.criterion_id ?? "").trim();
    const text = row.adGroupCriterion?.keyword?.text?.trim() || id;
    if (!id && !text) continue;
    out.push({
      id: id || text,
      name: text,
      status: row.adGroupCriterion?.status ?? "UNKNOWN",
      campaignId: row.campaign?.id ?? null,
      campaignName: row.campaign?.name ?? null,
      adSetId: row.adGroup?.id ?? null,
      adSetName: row.adGroup?.name ?? null,
      adId: null,
      adName: null,
      detail: row.adGroupCriterion?.keyword?.match_type ?? null,
      metrics: finalizeMetrics({}),
    });
  }
  return out;
}

async function fetchCreativeRows(params: QueryParams): Promise<AdsInsightsDeepRow[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status
    FROM ad_group_ad
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY campaign.id, ad_group.id
  `;
  const rows = await executeGaqlQuery({ ...params, query });
  const out: AdsInsightsDeepRow[] = [];
  for (const row of rows) {
    const adId = row.adGroupAd?.ad?.id ?? "";
    if (!adId) continue;
    out.push({
      id: adId,
      name: row.adGroupAd?.ad?.name?.trim() || adId,
      status: row.adGroupAd?.status ?? "UNKNOWN",
      campaignId: row.campaign?.id ?? null,
      campaignName: row.campaign?.name ?? null,
      adSetId: row.adGroup?.id ?? null,
      adSetName: row.adGroup?.name ?? null,
      adId,
      adName: row.adGroupAd?.ad?.name ?? null,
      detail: row.adGroupAd?.ad?.type ?? null,
      metrics: finalizeMetrics({}),
    });
  }
  return out;
}

function buildSearchTermRowsFromKeywords(keywords: AdsInsightsDeepRow[]): AdsInsightsDeepRow[] {
  return keywords.map((kw) => ({
    ...kw,
    id: `search|${kw.id}`,
    name: `${kw.name} query`,
    detail: "MOCK_SEARCH_TERM",
    metrics: finalizeMetrics({}),
  }));
}

/**
 * 在测试账号创建 Search 广告完整结构：Budget → Campaign → AdGroup → Ad → Keyword。
 */
export async function seedGoogleAdsSandboxFullStructure(
  shop: string,
): Promise<GoogleSandboxSeedResult> {
  const queryParams = await resolveSandboxQueryParams(shop);
  if (!queryParams) {
    throw new Error("Google Ads 测试账号未授权，请先完成 OAuth 并选择测试客户账户");
  }

  const customerId = normalizeCustomerId(queryParams.customerId);
  const stamp = Date.now().toString(36);
  const campaignName = `Spark Test Campaign ${stamp}`;
  const adGroupName = `Spark Test AdGroup ${stamp}`;
  const keywordText = `spark test ${stamp}`;
  const warnings: string[] = [];

  const customerResource = `customers/${customerId}`;
  const operations = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: `${customerResource}/campaignBudgets/-1`,
          name: `Spark Test Budget ${stamp}`,
          amountMicros: "50000000",
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: `${customerResource}/campaigns/-2`,
          name: campaignName,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: `${customerResource}/campaignBudgets/-1`,
          manualCpc: {},
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
        },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: `${customerResource}/adGroups/-3`,
          campaign: `${customerResource}/campaigns/-2`,
          name: adGroupName,
          status: "PAUSED",
          type: "SEARCH_STANDARD",
          cpcBidMicros: "1000000",
        },
      },
    },
    {
      adGroupAdOperation: {
        create: {
          adGroup: `${customerResource}/adGroups/-3`,
          status: "PAUSED",
          ad: {
            responsiveSearchAd: {
              headlines: [
                { text: `Spark Headline A ${stamp}` },
                { text: `Spark Headline B ${stamp}` },
                { text: "Spark Test Ad" },
              ],
              descriptions: [
                { text: "Spark sandbox test description one." },
                { text: "Spark sandbox test description two." },
              ],
            },
            finalUrls: ["https://www.example.com"],
          },
        },
      },
    },
    {
      adGroupCriterionOperation: {
        create: {
          adGroup: `${customerResource}/adGroups/-3`,
          status: "PAUSED",
          keyword: {
            text: keywordText,
            matchType: "BROAD",
          },
        },
      },
    },
  ];

  let mutateResponse: Record<string, unknown>;
  try {
    mutateResponse = await executeMutate({ ...queryParams, operations });
  } catch (e) {
    console.error(`${LOG_PREFIX} seed mutate ${formatOutboundErrorLog(e)}`);
    throw e;
  }

  const campaignId = extractResourceId(mutateResponse, 1);
  const adGroupId = extractResourceId(mutateResponse, 2);
  const adId = extractResourceId(mutateResponse, 3);
  const keywordId = extractResourceId(mutateResponse, 4);

  if (!campaignId) warnings.push("campaign 创建结果未返回 resource id");
  if (!adGroupId) warnings.push("ad group 创建结果未返回 resource id");
  if (!adId) warnings.push("ad 创建结果未返回 resource id");
  if (!keywordId) warnings.push("keyword 创建结果未返回 resource id");

  return {
    customerId,
    campaignId,
    adGroupId,
    adId,
    keywordId,
    campaignName,
    warnings,
  };
}

export async function fetchGoogleAdsSandboxInsights(
  shop: string,
  rangeDays: AdsInsightsRangeDays,
  options?: {
    includeStructure?: boolean;
    includeKeywords?: boolean;
    includeSearchTerms?: boolean;
    includeCreatives?: boolean;
  },
): Promise<AdsInsightsResult | null> {
  const cred = await getGoogleAdsSandboxCredential(shop);
  if (!cred) return null;

  const queryParams = await resolveSandboxQueryParams(shop);
  if (!queryParams) return null;

  const { dateStart, dateEnd } = resolveDateWindow(rangeDays);
  const includeStructure = options?.includeStructure !== false;
  const wantKeywords = Boolean(options?.includeKeywords);
  const wantSearchTerms = Boolean(options?.includeSearchTerms);
  const wantCreatives = Boolean(options?.includeCreatives);

  let currencyCode: string | null = null;
  let campaigns: AdsInsightsResult["campaigns"] = [];

  if (includeStructure) {
    const { rows, currencyCode: cc } = await fetchStructureRows(queryParams);
    currencyCode = cc;
    const flat = rows
      .map((row) => {
        const campaignId = row.campaign?.id ?? "";
        const adGroupId = row.adGroup?.id ?? "";
        const adId = row.adGroupAd?.ad?.id ?? "";
        return {
          campaignId,
          campaignName: row.campaign?.name ?? campaignId,
          campaignStatus: row.campaign?.status ?? "UNKNOWN",
          adSetId: adGroupId,
          adSetName: row.adGroup?.name ?? adGroupId,
          adSetStatus: row.adGroup?.status ?? "UNKNOWN",
          adId,
          adName: row.adGroupAd?.ad?.name ?? adId,
          adStatus: row.adGroupAd?.status ?? "UNKNOWN",
          metrics: finalizeMetrics({}),
        };
      })
      .filter((r) => r.campaignId && r.adSetId && r.adId);

    campaigns = applyGoogleSandboxMockMetrics(nestFlatAdRows(flat));
  }

  const [keywords, creatives] = await Promise.all([
    wantKeywords ? fetchKeywordRows(queryParams) : Promise.resolve([]),
    wantCreatives ? fetchCreativeRows(queryParams) : Promise.resolve([]),
  ]);

  const mockedKeywords = applyGoogleSandboxMockDeepRows(keywords);
  const searchTerms = wantSearchTerms
    ? applyGoogleSandboxMockDeepRows(buildSearchTermRowsFromKeywords(mockedKeywords))
    : [];

  return {
    platform: "google",
    accountId: cred.customerId,
    accountName: cred.descriptiveName ?? null,
    sandbox: true,
    currencyCode,
    rangeDays,
    dateStart,
    dateEnd,
    campaigns,
    keywords: wantKeywords ? mockedKeywords : undefined,
    searchTerms: wantSearchTerms ? searchTerms : undefined,
    creatives: wantCreatives ? applyGoogleSandboxMockDeepRows(creatives) : undefined,
  };
}
