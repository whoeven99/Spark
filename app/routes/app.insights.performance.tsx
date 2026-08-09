/**
 * 洞察 › 投放表现：Meta / Google / TikTok 的系列→广告组→广告结构与指标。
 * 原路径 `/app/settings/ads-insights` 已迁到这里，旧路径保留重定向。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsCredential,
  getGoogleAdsSandboxCredential,
  getGoogleAdsSandboxPending,
  getMetaAdsCredential,
  getMetaAdsPending,
  getTiktokAdsInsightsCredential,
  getTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { isTiktokSandboxConfigured } from "../server/adsInsights/tiktokSandbox.server";
import { isMetaSandboxConfigured } from "../server/adsInsights/metaSandbox.server";
import { AdsInsightsPage } from "./page/AdsInsightsPage";

export type AdsInsightsPageLoaderData = {
  connections: {
    meta: {
      connected: boolean;
      adAccountId: string | null;
      adAccountName: string | null;
      currencyCode: string | null;
      pendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
      availableAccounts: Array<{ id: string; name?: string; formatted?: string }>;
      sandboxConfigured: boolean;
    };
    google: {
      connected: boolean;
      customerId: string | null;
      sandboxConnected: boolean;
      sandboxCustomerId: string | null;
      sandboxCustomerName: string | null;
      sandboxPendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
    };
    tiktok: {
      connected: boolean;
      advertiserId: string | null;
      awaitingCatalog: boolean;
      sandboxConfigured: boolean;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [meta, metaPending, google, googleSandbox, googleSandboxPending, tiktok, tiktokInsights] =
    await Promise.all([
    getMetaAdsCredential(session.shop),
    getMetaAdsPending(session.shop),
    getGoogleAdsCredential(session.shop),
    getGoogleAdsSandboxCredential(session.shop),
    getGoogleAdsSandboxPending(session.shop),
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
        sandboxConfigured: isMetaSandboxConfigured(),
      },
      google: {
        connected: Boolean(google),
        customerId: google?.customerId ?? null,
        sandboxConnected: Boolean(googleSandbox),
        sandboxCustomerId: googleSandbox?.customerId ?? null,
        sandboxCustomerName: googleSandbox?.descriptiveName ?? null,
        sandboxPendingAccounts: googleSandboxPending?.accounts ?? [],
      },
      tiktok: {
        connected: Boolean(tiktokInsights),
        advertiserId: tiktokInsights?.advertiserId ?? null,
        awaitingCatalog: Boolean(tiktokInsights && !tiktok),
        sandboxConfigured: isTiktokSandboxConfigured(),
      },
    },
  } satisfies AdsInsightsPageLoaderData;
};

export default function AppInsightsPerformance() {
  return <AdsInsightsPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
