import type { LoaderFunctionArgs } from "react-router";
import { detectRequestLocale, readShopifySessionLocale } from "../../i18n/detector.server";
import { authenticate } from "../../shopify.server";
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
import { computeChannelRoi } from "./channelRoi.server";
import { ensureCustomerValueLayer } from "./customerValue.server";
import { listOperationTasks } from "./dailyInspection.server";
import { computeOperationsDiagnosis } from "./diagnosis.server";
import { getShopCostConfig } from "./roi/costConfig.server";
import type { LiveSnapshotData } from "./businessReportSnapshot.shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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

    const [customerAggregates, channelRoi, ads, ga4, pageSpeed] = await Promise.all([
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
                rangeDays: 30,
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
        const totalConversionsValue = platformSummaries.reduce(
          (sum, item) => sum + item.conversionsValue,
          0,
        );

        return {
          rangeDays: 30 as const,
          totalSpend,
          totalClicks,
          totalImpressions,
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
            queryGa4MergedSummaryAndTimeSeries(accessToken, propertyIds, 7),
            queryGa4MergedByDimension(
              accessToken,
              propertyIds,
              7,
              "sessionDefaultChannelGroup",
              6,
            ),
            queryGa4MergedByDimension(accessToken, propertyIds, 7, "landingPage", 6),
          ]);

          return {
            connected: true,
            propertyCount: ga4Credential.properties.length,
            startDate: summaryResult.startDate,
            endDate: summaryResult.endDate,
            summary: summaryResult.summary,
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
      } satisfies LiveSnapshotData,
    };
  } catch (error) {
    console.error("[today.insights] loader failed:", error);
    return {
      liveData: null as LiveSnapshotData | null,
    };
  }
};
