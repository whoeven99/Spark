import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGa4Credential,
  getGa4Pending,
  setGa4Credential,
} from "../server/googleAnalytics/ga4Credentials.server";
import { listGa4Properties, refreshGa4AccessToken } from "../server/googleAnalytics/ga4Api.server";
import { GoogleAnalyticsPage } from "./page/GoogleAnalyticsPage";

export type Ga4SettingsLoaderData = {
  connected: boolean;
  properties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }>;
  allProperties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }>;
  hasPending: boolean;
  pendingProperties: Array<{ propertyId: string; propertyName: string; accountName: string; accountId?: string }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [credential, pending] = await Promise.all([
    getGa4Credential(session.shop),
    getGa4Pending(session.shop),
  ]);

  let allProperties = credential?.allProperties ?? [];
  if (credential && allProperties.length === 0 && credential.refreshToken) {
    try {
      const accessToken = await refreshGa4AccessToken(credential.refreshToken);
      const listed = await listGa4Properties(accessToken);
      if (listed.length > 0) {
        allProperties = listed;
        await setGa4Credential(session.shop, {
          ...credential,
          accessToken,
          allProperties: listed,
        });
      }
    } catch {
      // 拉取失败时回退到已保存的 properties
    }
  }

  return {
    connected: Boolean(credential?.properties.length),
    properties: credential?.properties ?? [],
    allProperties,
    hasPending: Boolean(pending),
    pendingProperties: pending?.properties ?? [],
  } satisfies Ga4SettingsLoaderData;
};

export default function AppSettingsGoogleAnalytics() {
  return <GoogleAnalyticsPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
