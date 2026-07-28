import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGa4Credential,
  getGa4Pending,
} from "../server/googleAnalytics/ga4Credentials.server";
import { GoogleAnalyticsPage } from "./page/GoogleAnalyticsPage";

export type Ga4SettingsLoaderData = {
  connected: boolean;
  properties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }>;
  hasPending: boolean;
  pendingProperties: Array<{ propertyId: string; propertyName: string; accountName: string; accountId?: string }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [credential, pending] = await Promise.all([
    getGa4Credential(session.shop),
    getGa4Pending(session.shop),
  ]);

  return {
    connected: Boolean(credential?.properties.length),
    properties: credential?.properties ?? [],
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
