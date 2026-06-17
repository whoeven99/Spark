import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listTasksPageForShop } from "../server/aiTask/aiTaskStore.server";
import {
  getFacebookCatalogCredential,
  getGoogleMerchantCredential,
  maskTokenTail,
} from "../server/adsCatalog/credentialStore.server";
import { useFeatureView } from "../lib/featureTrack";
import { RoutePageFallback } from "./component/RoutePageFallback";

const AdsCatalogPage = lazy(() =>
  import("./page/AdsCatalogPage").then((m) => ({ default: m.AdsCatalogPage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [initialTaskPage, fb, gg] = await Promise.all([
    listTasksPageForShop({
      shop: session.shop,
      view: "current",
      taskType: "ads_catalog_sync",
    }),
    getFacebookCatalogCredential(session.shop),
    getGoogleMerchantCredential(session.shop),
  ]);

  return Response.json({
    initialTaskPage,
    credentials: {
      facebook: {
        configured: Boolean(fb),
        updatedAt: fb?.updatedAt ?? null,
        fields: {
          accessTokenMasked: fb ? maskTokenTail(fb.accessToken) : "",
          catalogId: fb?.catalogId ?? "",
          businessId: fb?.businessId ?? "",
          apiVersion: fb?.apiVersion ?? "",
        },
      },
      google: {
        configured: Boolean(gg),
        updatedAt: gg?.updatedAt ?? null,
        fields: {
          accessTokenMasked: gg ? maskTokenTail(gg.accessToken) : "",
          refreshTokenMasked: gg?.refreshToken ? maskTokenTail(gg.refreshToken) : "",
          clientIdMasked: gg?.clientId ? maskTokenTail(gg.clientId) : "",
          clientSecretMasked: gg?.clientSecret ? maskTokenTail(gg.clientSecret) : "",
          merchantId: gg?.merchantId ?? "",
        },
      },
    },
  });
};

export default function AppAdsCatalog() {
  useFeatureView("ads-catalog");
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsCatalogPage />
    </Suspense>
  );
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname) {
    return defaultShouldRevalidate;
  }
  return defaultShouldRevalidate;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
