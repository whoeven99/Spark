/**
 * Ads Insights 数据装配层：给投放表现页提供连接状态和凭据摘要。
 * 旧的 Insights 路径只保留兼容跳转，这个模块只负责复用 loader / UI 逻辑。
 */
import { lazy, Suspense } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsCredential,
  getMetaAdsCredential,
  getMetaAdsPending,
  getTiktokAdsInsightsCredential,
  getTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { RoutePageFallback } from "./component/RoutePageFallback";

const AdsInsightsPage = lazy(() =>
  import("./page/AdsInsightsPage").then((m) => ({ default: m.AdsInsightsPage })),
);

export type AdsInsightsPageLoaderData = {
  connections: {
    meta: {
      connected: boolean;
      adAccountId: string | null;
      adAccountName: string | null;
      currencyCode: string | null;
      pendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
      availableAccounts: Array<{ id: string; name?: string; formatted?: string }>;
    };
    google: {
      connected: boolean;
      customerId: string | null;
    };
    tiktok: {
      connected: boolean;
      advertiserId: string | null;
      awaitingCatalog: boolean;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [meta, metaPending, google, tiktok, tiktokInsights] = await Promise.all([
    getMetaAdsCredential(session.shop),
    getMetaAdsPending(session.shop),
    getGoogleAdsCredential(session.shop),
    getTiktokCatalogCredential(session.shop),
    getTiktokAdsInsightsCredential(session.shop),
  ]);

  return {
    connections: {
      meta: {
        connected: Boolean(meta),
        adAccountId: meta?.adAccountId ?? null,
        adAccountName: meta?.adAccountName ?? null,
        currencyCode: meta?.currencyCode ?? null,
        pendingAccounts: metaPending?.accounts ?? [],
        availableAccounts: meta?.availableAccounts ?? [],
      },
      google: {
        connected: Boolean(google),
        customerId: google?.customerId ?? null,
      },
      tiktok: {
        connected: Boolean(tiktokInsights),
        advertiserId: tiktokInsights?.advertiserId ?? null,
        awaitingCatalog: Boolean(tiktokInsights && !tiktok),
      },
    },
  } satisfies AdsInsightsPageLoaderData;
};

export default function InsightsChartsPerformancePage() {
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsInsightsPage />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
