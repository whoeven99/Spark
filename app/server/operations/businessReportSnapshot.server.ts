import type { LoaderFunctionArgs } from "react-router";
import { detectRequestLocale, readShopifySessionLocale } from "../../i18n/detector.server";
import { hasReadReportsScope, readNumericCell } from "../../lib/shopifyReports";
import { authenticate } from "../../shopify.server";
import { parseRangeDays } from "../adsInsights/dateRange.server";
import { fetchAdsInsights } from "../adsInsights/index.server";
import { mergeMetrics } from "../adsInsights/nest.server";
import { emptyMetrics, type AdsInsightsPlatform } from "../adsInsights/types.server";
import {
  queryGa4MergedByDimension,
  queryGa4MergedSummaryAndTimeSeries,
  refreshGa4AccessToken,
} from "../googleAnalytics/ga4Api.server";
import { getGa4Credential, setGa4Credential } from "../googleAnalytics/ga4Credentials.server";
import { runPageSpeedAnalysis } from "../pageSpeed/pageSpeedApi.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
import { executeShopifyqlQuery } from "../shopifyql/shopifyqlQuery.server";
import { computeChannelRoi } from "./channelRoi.server";
import { ensureCustomerValueLayer } from "./customerValue.server";
import { listOperationTasks } from "./dailyInspection.server";
import { computeOperationsDiagnosis } from "./diagnosis.server";
import { getShopCostConfig } from "./roi/costConfig.server";
import type { LiveSnapshotData } from "./businessReportSnapshot.shared";

function buildSince(rangeDays: number): string {
  return `-${rangeDays}d`;
}

function buildSalesTrendQuery(rangeDays: number): string {
  return `FROM sales SHOW total_sales, orders TIMESERIES day SINCE ${buildSince(rangeDays)} UNTIL today ORDER BY day ASC`;
}

function buildRefundTrendQuery(rangeDays: number): string {
  return `FROM returns SHOW returned_quantity TIMESERIES day SINCE ${buildSince(rangeDays)} UNTIL today ORDER BY day ASC`;
}

function buildFulfillmentTrendQuery(rangeDays: number): string {
  return `FROM fulfillments SHOW orders_fulfilled, orders_shipped TIMESERIES day SINCE ${buildSince(rangeDays)} UNTIL today ORDER BY day ASC`;
}

function buildStorefrontFunnelQuery(rangeDays: number): string {
  return `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout SINCE ${buildSince(rangeDays)} UNTIL today`;
}

export async function loadBusinessReportLiveData(
  request: Request,
): Promise<{ liveData: LiveSnapshotData | null }> {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeDays = parseRangeDays(url.searchParams.get("range"));
  const now = new Date();
  const requestLocale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });

  try {
    const costConfig = await getShopCostConfig(session.shop);
    const operationTasks = await listOperationTasks(session.shop).catch((error) => {
      console.error("[today.insights] operation tasks load failed:", error);
      return [];
    });
    const diagnosis = await computeOperationsDiagnosis(session.shop, now);
    const ga4Credential = await getGa4Credential(session.shop).catch((error) => {
      console.error("[today.insights] ga4 credential load failed:", error);
      return null;
    });

    const [customerAggregates, channelRoi, ads, ga4, pageSpeed, shopifyReports] = await Promise.all([
      ensureCustomerValueLayer(session.shop, costConfig.defaultGrossMarginPercent, { now }).catch((error) => {
        console.error("[today.insights] customer value layer failed:", error);
        return null;
      }),
      computeChannelRoi(session.shop, costConfig, now).catch((error) => {
        console.error("[today.insights] channel roi failed:", error);
        return null;
      }),
      (async () => {
        const platforms: AdsInsightsPlatform[] = ["meta", "google", "tiktok"];
        const results = await Promise.all(
          platforms.map(async (platform) => {
            try {
              return await fetchAdsInsights({
                shop: session.shop,
                platform,
                rangeDays,
                view: "structure",
              });
            } catch (error) {
              console.error(`[today.insights] ads insights failed: ${platform}`, error);
              return null;
            }
          }),
        );

        const platformSummaries = results
          .map((result, index) => {
            if (!result) return null;
            const totals = result.campaigns.reduce(
              (acc, campaign) => mergeMetrics(acc, campaign.metrics),
              emptyMetrics(),
            );
            return {
              platform: platforms[index],
              accountName: result.accountName ?? null,
              currencyCode: result.currencyCode ?? null,
              spend: totals.spend,
              clicks: totals.clicks,
              impressions: totals.impressions,
              conversions: totals.conversions,
              conversionsValue: totals.conversionsValue,
              roas: totals.roas,
              campaignCount: result.campaigns.length,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .filter((item) => item.spend > 0 || item.campaignCount > 0);

        if (platformSummaries.length === 0) return null;

        const totalSpend = platformSummaries.reduce((sum, item) => sum + item.spend, 0);
        const totalClicks = platformSummaries.reduce((sum, item) => sum + item.clicks, 0);
        const totalImpressions = platformSummaries.reduce((sum, item) => sum + item.impressions, 0);
        const totalConversions = platformSummaries.reduce((sum, item) => sum + item.conversions, 0);
        const totalConversionsValue = platformSummaries.reduce(
          (sum, item) => sum + item.conversionsValue,
          0,
        );

        return {
          rangeDays,
          totalSpend,
          totalClicks,
          totalImpressions,
          totalConversions,
          totalConversionsValue,
          totalRoas: totalSpend > 0 ? totalConversionsValue / totalSpend : null,
          currencyCode:
            platformSummaries.find((item) => item.currencyCode)?.currencyCode ??
            diagnosis.summaryMetrics.currency ??
            null,
          platformSummaries,
        };
      })(),
      (async () => {
        if (!ga4Credential || ga4Credential.properties.length === 0) {
          return {
            connected: false,
            propertyCount: 0,
            startDate: null,
            endDate: null,
            summary: null,
            timeSeries: [],
            channelRows: [],
            landingRows: [],
            error: null,
          };
        }

        let accessToken = ga4Credential.accessToken;
        if (ga4Credential.refreshToken) {
          try {
            accessToken = await refreshGa4AccessToken(ga4Credential.refreshToken);
            await setGa4Credential(session.shop, { ...ga4Credential, accessToken });
          } catch {
            // refresh 失败时继续尝试旧 token
          }
        }

        try {
          const propertyIds = ga4Credential.properties.map((property) => property.propertyId);
          const [summaryResult, channelResult, landingResult] = await Promise.all([
            queryGa4MergedSummaryAndTimeSeries(accessToken, propertyIds, rangeDays),
            queryGa4MergedByDimension(
              accessToken,
              propertyIds,
              rangeDays,
              "sessionDefaultChannelGroup",
              6,
            ),
            queryGa4MergedByDimension(accessToken, propertyIds, rangeDays, "landingPage", 6),
          ]);

          return {
            connected: true,
            propertyCount: ga4Credential.properties.length,
            startDate: summaryResult.startDate,
            endDate: summaryResult.endDate,
            summary: summaryResult.summary,
            timeSeries: summaryResult.timeSeries,
            channelRows: channelResult.rows,
            landingRows: landingResult.rows,
            error: null,
          };
        } catch (error) {
          console.error("[today.insights] ga4 query failed:", error);
          return {
            connected: true,
            propertyCount: ga4Credential.properties.length,
            startDate: null,
            endDate: null,
            summary: null,
            timeSeries: [],
            channelRows: [],
            landingRows: [],
            error: error instanceof Error ? error.message : "GA4 查询失败",
          };
        }
      })(),
      (async () => {
        const shopInfo = await fetchShopBasicInfo(admin).catch((error) => {
          console.error("[today.insights] shop basic info failed:", error);
          return null;
        });
        const url = shopInfo?.primaryDomainUrl?.trim() || shopInfo?.url?.trim() || null;
        if (!url) {
          return {
            url: null,
            strategy: "mobile" as const,
            report: null,
            error: null,
          };
        }

        try {
          const report = await runPageSpeedAnalysis({
            url,
            strategy: "mobile",
            locale: requestLocale,
          });
          return {
            url,
            strategy: "mobile" as const,
            report,
            error: null,
          };
        } catch (error) {
          console.error("[today.insights] pagespeed failed:", error);
          return {
            url,
            strategy: "mobile" as const,
            report: null,
            error: error instanceof Error ? error.message : "PageSpeed 分析失败",
          };
        }
      })(),
      (async () => {
        if (!hasReadReportsScope(session.scope)) {
          return {
            access: "missing_scope" as const,
            currencyCode: diagnosis.summaryMetrics.currency ?? null,
            salesTrend: [],
            refundTrend: [],
            fulfillmentTrend: [],
            storefrontFunnel: null,
          };
        }

        const [salesResult, refundResult, fulfillmentResult, storefrontResult] = await Promise.all([
          executeShopifyqlQuery(admin, buildSalesTrendQuery(rangeDays)),
          executeShopifyqlQuery(admin, buildRefundTrendQuery(rangeDays)),
          executeShopifyqlQuery(admin, buildFulfillmentTrendQuery(rangeDays)),
          executeShopifyqlQuery(admin, buildStorefrontFunnelQuery(rangeDays)),
        ]);

        if (
          salesResult.accessDenied ||
          refundResult.accessDenied ||
          fulfillmentResult.accessDenied ||
          storefrontResult.accessDenied
        ) {
          return {
            access: "access_denied" as const,
            currencyCode: diagnosis.summaryMetrics.currency ?? null,
            salesTrend: [],
            refundTrend: [],
            fulfillmentTrend: [],
            storefrontFunnel: null,
          };
        }

        if (!salesResult.ok) {
          console.error("[today.insights] sales trend query failed:", salesResult.error);
        }
        if (!refundResult.ok) {
          console.error("[today.insights] refund trend query failed:", refundResult.error);
        }
        if (!fulfillmentResult.ok) {
          console.error("[today.insights] fulfillment trend query failed:", fulfillmentResult.error);
        }
        if (!storefrontResult.ok) {
          console.error("[today.insights] storefront funnel query failed:", storefrontResult.error);
        }

        return {
          access: "ok" as const,
          currencyCode: diagnosis.summaryMetrics.currency ?? null,
          salesTrend: salesResult.ok
            ? salesResult.rows.map((row) => ({
                date: String(row.day ?? ""),
                sales: readNumericCell(row, "total_sales") ?? 0,
                orders: readNumericCell(row, "orders") ?? 0,
              }))
            : [],
          refundTrend: refundResult.ok
            ? refundResult.rows.map((row) => ({
                date: String(row.day ?? ""),
                returnedQuantity: readNumericCell(row, "returned_quantity") ?? 0,
              }))
            : [],
          fulfillmentTrend: fulfillmentResult.ok
            ? fulfillmentResult.rows.map((row) => ({
                date: String(row.day ?? ""),
                fulfilled: readNumericCell(row, "orders_fulfilled") ?? 0,
                shipped: readNumericCell(row, "orders_shipped") ?? 0,
              }))
            : [],
          storefrontFunnel:
            storefrontResult.ok && storefrontResult.rows[0]
              ? {
                  sessions: readNumericCell(storefrontResult.rows[0], "sessions") ?? 0,
                  cartAdditions:
                    readNumericCell(storefrontResult.rows[0], "sessions_with_cart_additions") ?? 0,
                  reachedCheckout:
                    readNumericCell(storefrontResult.rows[0], "sessions_that_reached_checkout") ??
                    0,
                  completedCheckout:
                    readNumericCell(storefrontResult.rows[0], "sessions_that_completed_checkout") ??
                    0,
                }
              : null,
        };
      })(),
    ]);

    return {
      liveData: {
        shop: session.shop,
        generatedAt: now.toISOString(),
        costConfigured: costConfig.isConfigured,
        operationTasks,
        diagnosis,
        customerAggregates,
        channelRoi,
        ads,
        ga4,
        pageSpeed,
        shopifyReports,
      } satisfies LiveSnapshotData,
    };
  } catch (error) {
    console.error("[today.insights] loader failed:", error);
    return {
      liveData: null,
    };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return loadBusinessReportLiveData(request);
};
