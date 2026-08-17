import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import { PageSpeedInsightsPage } from "./page/PageSpeedInsightsPage";

export type PageSpeedSettingsLoaderData = {
  defaultUrl: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const shopInfo = await fetchShopBasicInfo(admin).catch(() => null);
  return {
    defaultUrl: shopInfo?.primaryDomainUrl?.trim() || "",
  } satisfies PageSpeedSettingsLoaderData;
};

export default function AppSettingsPageSpeed() {
  return <PageSpeedInsightsPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
