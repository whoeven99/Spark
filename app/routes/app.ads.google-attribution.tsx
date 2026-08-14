import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { getGoogleAdsCredential } from "../server/adsCatalog/credentialStore.server";
import { getGa4Credential } from "../server/googleAnalytics/ga4Credentials.server";
import { GoogleAttributionPage } from "./page/GoogleAttributionPage";

export type GoogleAttributionLoaderData = {
  adsConnected: boolean;
  ga4Connected: boolean;
  adsCustomerId: string | null;
  ga4PropertyCount: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [ads, ga4] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    getGa4Credential(session.shop),
  ]);

  return {
    adsConnected: Boolean(ads),
    ga4Connected: Boolean(ga4?.properties.length),
    adsCustomerId: ads?.customerId ?? null,
    ga4PropertyCount: ga4?.properties.length ?? 0,
  } satisfies GoogleAttributionLoaderData;
};

export default function AppAdsGoogleAttribution() {
  return <GoogleAttributionPage />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation();
  const message = isRouteErrorResponse(error)
    ? error.statusText || String(error.status)
    : error instanceof Error
      ? error.message
      : t("googleAttribution.networkError");

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{t("googleAttribution.title")}</h2>
      <p style={{ margin: 0, color: "#616161", lineHeight: 1.5 }}>{t("googleAttribution.networkError")}</p>
      {import.meta.env.DEV ? (
        <pre style={{ marginTop: 16, fontSize: 12, color: "#b00020", whiteSpace: "pre-wrap" }}>
          {message}
        </pre>
      ) : null}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
