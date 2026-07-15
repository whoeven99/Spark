import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsCredential,
  getMetaAdsCredential,
  getMetaAdsPending,
  getTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { isTiktokSandboxConfigured } from "../server/adsInsights/tiktokSandbox.server";
import { AdsInsightsPage } from "./page/AdsInsightsPage";

export type AdsInsightsPageLoaderData = {
  connections: {
    meta: {
      connected: boolean;
      adAccountId: string | null;
      adAccountName: string | null;
      currencyCode: string | null;
      pendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
    };
    google: {
      connected: boolean;
      customerId: string | null;
    };
    tiktok: {
      connected: boolean;
      advertiserId: string | null;
      sandboxConfigured: boolean;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [meta, metaPending, google, tiktok] = await Promise.all([
    getMetaAdsCredential(session.shop),
    getMetaAdsPending(session.shop),
    getGoogleAdsCredential(session.shop),
    getTiktokCatalogCredential(session.shop),
  ]);

  return {
    connections: {
      meta: {
        connected: Boolean(meta),
        adAccountId: meta?.adAccountId ?? null,
        adAccountName: meta?.adAccountName ?? null,
        currencyCode: meta?.currencyCode ?? null,
        pendingAccounts: metaPending?.accounts ?? [],
      },
      google: {
        connected: Boolean(google),
        customerId: google?.customerId ?? null,
      },
      tiktok: {
        connected: Boolean(tiktok),
        advertiserId: tiktok?.advertiserId ?? null,
        sandboxConfigured: isTiktokSandboxConfigured(),
      },
    },
  } satisfies AdsInsightsPageLoaderData;
};

export default function AppSettingsAdsInsights() {
  return <AdsInsightsPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
