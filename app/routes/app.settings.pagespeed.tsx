import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { resolvePageSpeedLocale, type PageSpeedLocaleCode } from "../lib/pageSpeedLocales";
import { fetchShopLocalesPayload } from "../server/productImprove/shopLocalesFetcher.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { PageSpeedInsightsPage } from "./page/PageSpeedInsightsPage";

export type PageSpeedSettingsLoaderData = {
  defaultUrl: string;
  defaultReportLocale: PageSpeedLocaleCode;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  const source = requestUrl.searchParams.get("source")?.trim();
  const [shopInfo, shopLocales] = await Promise.all([
    fetchShopBasicInfo(admin).catch(() => null),
    fetchShopLocalesPayload(admin, `[PageSpeedSettings] shop=${session.shop}`),
  ]);
  const myshopifyDomain = shopInfo?.myshopifyDomain?.trim() || session.shop;
  const defaultMyshopifyUrl = `https://${myshopifyDomain}`;
  const defaultUrl =
    source === "health-monitor"
      ? defaultMyshopifyUrl
      : shopInfo?.primaryDomainUrl?.trim() || defaultMyshopifyUrl;
  return {
    defaultUrl,
    defaultReportLocale: resolvePageSpeedLocale(shopLocales.defaultTargetLanguage),
  } satisfies PageSpeedSettingsLoaderData;
};

export default function AppSettingsPageSpeed() {
  return <PageSpeedInsightsPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
